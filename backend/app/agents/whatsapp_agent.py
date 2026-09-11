import re
import json
import logging
import urllib.request
import os
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.core.config import settings
from app.models.core import User, Facility, Supplier
from app.models.inventory import Product, ProductVariant, InventorySnapshot, SupplierReturn
from app.models.purchasing import PurchaseOrder
from app.models.digital_workers import DigitalWorker, DigitalWorkerConversation, DigitalWorkerMessage
from app.services.device_pairing_service import pair_device_by_pin, get_authenticated_user_by_phone
from app.services.mrp_bot_service import diagnose_stockouts, generate_supplier_po_draft

logger = logging.getLogger(__name__)

def execute_stock_lookup(query_text: str, db: Session, limit: int = 5) -> List[Dict[str, Any]]:
    """Busca existencia de productos por SKU, código de barra o nombre."""
    results = []
    variants = db.query(ProductVariant).join(Product).filter(
        or_(
            ProductVariant.sku.ilike(f"%{query_text}%"),
            ProductVariant.barcode.ilike(f"%{query_text}%"),
            Product.name.ilike(f"%{query_text}%")
        )
    ).limit(limit).all()

    for v in variants:
        stocks = db.query(InventorySnapshot, Facility).join(Facility, InventorySnapshot.facility_id == Facility.id).filter(
            InventorySnapshot.variant_id == v.id
        ).all()
        
        facilities_stock = []
        for s, f in stocks:
            facilities_stock.append({
                "facility": f.name,
                "on_hand": float(s.stock_qty or 0),
                "available": float(s.stock_qty or 0)
            })
            
        results.append({
            "sku": v.sku,
            "product_name": v.product.name if v.product else "N/A",
            "attributes": v.attributes or {},
            "stock_by_facility": facilities_stock
        })
    return results

def execute_negative_stock_lookup(db: Session) -> List[Dict[str, Any]]:
    """Obtiene variantes con saldo de inventario negativo."""
    negative_stocks = db.query(InventorySnapshot, ProductVariant, Product, Facility).join(
        ProductVariant, InventorySnapshot.variant_id == ProductVariant.id
    ).join(
        Product, ProductVariant.product_id == Product.id
    ).join(
        Facility, InventorySnapshot.facility_id == Facility.id
    ).filter(
        InventorySnapshot.stock_qty < 0
    ).all()

    items = []
    for s, v, p, f in negative_stocks:
        items.append({
            "facility": f.name,
            "sku": v.sku,
            "product": p.name,
            "quantity_negative": float(s.stock_qty)
        })
    return items

def execute_unreconciled_orders_lookup(db: Session) -> List[Dict[str, Any]]:
    """Obtiene órdenes de compra pendientes de conciliación."""
    orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.reconciliation_status != 'MATCHED',
        PurchaseOrder.status.in_(['approved', 'received', 'partially_received', 'confirmed'])
    ).limit(10).all()

    items = []
    for po in orders:
        supplier_name = "Proveedor"
        try:
            from app.models.core import Supplier
            s = db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
            if s:
                supplier_name = s.name
        except Exception:
            pass

        items.append({
            "order_number": po.reference or f"ODC-{po.id}",
            "supplier": supplier_name,
            "status": po.status,
            "reconciliation_status": po.reconciliation_status or "PENDIENTE",
            "total_usd": float(po.total_amount or 0)
        })
    return items

def execute_returns_lookup(db: Session) -> List[Dict[str, Any]]:
    """Obtiene devoluciones o mermas pendientes."""
    returns = db.query(SupplierReturn).filter(
        SupplierReturn.status.in_(['DRAFT', 'PENDING', 'DISPATCHED'])
    ).limit(10).all()

    items = []
    for r in returns:
        items.append({
            "return_number": r.return_number,
            "facility_id": r.facility_id,
            "status": r.status,
            "reason": r.notes or "Devolución en muelle"
        })
    return items

def call_gemini_format(worker: DigitalWorker, user_name: str, user_message: str, data_context: Dict[str, Any]) -> str:
    """Invoca a Gemini para dar una respuesta con el tono y personalidad del Trabajador Digital."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None

    prompt = (
        f"Eres {worker.display_title} en Neo ERP. Tu rol es: {worker.system_prompt}.\n"
        f"Estás respondiendo un mensaje de WhatsApp a tu supervisor o colega {user_name}.\n"
        f"Mensaje del usuario: \"{user_message}\"\n\n"
        f"Datos extraídos del ERP para responder:\n{json.dumps(data_context, ensure_ascii=False, indent=2)}\n\n"
        f"Instrucciones:\n"
        f"- Responde de manera concisa, ejecutiva y profesional en español.\n"
        f"- Usa formato amigable de WhatsApp (*negrita*, viñetas •, emojis operativos).\n"
        f"- Si hay discrepancias o alertas (como negativos o faltantes), resáltalas con claridad.\n"
        f"- No inventes datos que no estén en el JSON."
    )

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        logger.warning(f"Error llamando a Gemini para formatear WhatsApp: {e}")
        return None

def process_incoming_whatsapp_message(sender_phone: str, message_text: str, db: Session) -> Dict[str, Any]:
    """
    Motor central de procesamiento para mensajes entrantes de WhatsApp.
    Maneja vinculación por PIN, verificación de identidad y ejecución de herramientas operativas.
    """
    raw_text = (message_text or "").strip()
    
    # 1. Detectar comando de vinculación PIN
    pin_match = re.search(r"(?:vincular|link|pin)\s*[:=]?\s*(\d{6})", raw_text, re.IGNORECASE)
    if pin_match:
        pin = pin_match.group(1)
        pairing_result = pair_device_by_pin(phone_number=sender_phone, pin=pin, db=db)
        return {
            "reply": pairing_result["message"],
            "authenticated": pairing_result["success"],
            "tool": "device_pairing"
        }

    # 2. Verificar autenticación del remitente
    user = get_authenticated_user_by_phone(sender_phone, db)
    if not user:
        return {
            "reply": (
                f"🔒 *Acceso no autorizado*\n\n"
                f"Tu número de WhatsApp (`+{sender_phone}`) no está vinculado a ningún usuario en Neo ERP.\n\n"
                f"Para vincular tu dispositivo:\n"
                f"1. Ingresa a Neo ERP > Usuarios Digitales.\n"
                f"2. Haz clic en *Generar PIN de WhatsApp*.\n"
                f"3. Escribe por aquí: *Vincular <TU_PIN_DE_6_DIGITOS>*."
            ),
            "authenticated": False,
            "tool": "auth_required"
        }

    # 3. Asignar Trabajador Digital según intención
    lower_text = raw_text.lower()
    is_purchase_intent = any(w in lower_text for w in ["compra", "odc", "orden", "proveedor", "mrp", "sugerido", "cotiz"])
    agent_code = "CLARA_COMPRAS" if is_purchase_intent else "ARTURO_WMS"
    
    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == agent_code).first()
    if not worker:
        worker = db.query(DigitalWorker).first()

    # 4. Obtener o crear conversación
    conv = db.query(DigitalWorkerConversation).filter(
        DigitalWorkerConversation.worker_id == worker.id,
        DigitalWorkerConversation.external_sender_id == sender_phone
    ).first()
    if not conv:
        conv = DigitalWorkerConversation(
            worker_id=worker.id,
            channel="WHATSAPP",
            external_sender_id=sender_phone,
            sender_user_id=user.id,
            is_authenticated=True,
            context_data={"user_email": user.email, "full_name": user.full_name}
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # Registrar mensaje entrante del usuario
    incoming_msg = DigitalWorkerMessage(
        conversation_id=conv.id,
        sender_type="USER",
        content=raw_text
    )
    db.add(incoming_msg)
    db.commit()

    # 5. Despacho de herramientas operativas (Tool Calling)
    tool_executed = "general"
    data_context = {}
    reply_text = ""

    # Primera Sede autorizada o sede 1 por defecto
    first_facility_id = user.facilities[0].id if user.facilities else 1

    # Detección: Generación quirúrgica de ODC para un proveedor
    is_create_po = (
        any(w in lower_text for w in ["genera", "generar", "crea", "crear", "haz", "hacer", "prepara", "preparar"]) and
        any(w in lower_text for w in ["odc", "orden", "borrador", "pedido de compra"])
    )

    # Detección: Diagnóstico de quiebres / reposición de compras
    is_purchase_stockout = (
        any(w in lower_text for w in ["falta comprar", "quiebre de proveedor", "quiebres de compra", "que comprar", "qué comprar", "diagnóstico de compras", "diagnostico", "reposicion", "reposición", "que falta", "qué falta"]) or
        ("quiebre" in lower_text and any(w in lower_text for w in ["proveedor", "proveedores", "compra", "compras", "mrp", "sugerido"]))
    )

    if is_create_po:
        tool_executed = "generate_supplier_order"
        suppliers = db.query(Supplier).filter(Supplier.is_active == True).all()
        matched_supplier = None
        for s in suppliers:
            s_name_lower = s.name.lower()
            if s_name_lower in lower_text:
                matched_supplier = s
                break
            # Palabras significativas del nombre (mínimo 4 letras)
            words = [w for w in re.findall(r'\b[a-zA-ZáéíóúÁÉÍÓÚñÑ]{4,}\b', s_name_lower)]
            if any(w in lower_text for w in words):
                matched_supplier = s
                break

        if matched_supplier:
            try:
                po_res = generate_supplier_po_draft(
                    db=db,
                    supplier_id=matched_supplier.id,
                    facility_id=first_facility_id,
                    notes=f"Generado vía WhatsApp por instrucción de {user.full_name}"
                )
                data_context = po_res
                reply_text = (
                    f"✅ *Orden de Compra Borrador Creada*\n\n"
                    f"He generado la orden *{po_res['order_reference']}* para *{matched_supplier.name}* en *{po_res['facility_name']}*.\n\n"
                    f"• Total Estimado: *${po_res['total_amount']:,.2f} USD*\n"
                    f"• Renglones: *{po_res['lines_count']} ítems calculados*\n"
                    f"• Estado: `DRAFT` (Borrador)\n\n"
                    f"_Ya está disponible en Neo ERP para revisión y firma._"
                )
            except Exception as ex:
                reply_text = f"⚠️ *No se pudo generar la orden*: {str(ex)}"
        else:
            reply_text = (
                f"❓ No logré identificar al proveedor en tu instrucción.\n\n"
                f"Por favor especifícalo con su nombre, por ejemplo:\n"
                f"• *'Clara, genera la orden para Cervecería Polar'*\n"
                f"• *'Prepara el borrador de Distribuidora Alimentos'*"
            )

    elif is_purchase_stockout:
        tool_executed = "diagnose_stockouts"
        diagnosis = diagnose_stockouts(db, facility_id=first_facility_id)
        data_context = {
            "critical_count": diagnosis.get("critical_suppliers_count", 0),
            "warning_count": diagnosis.get("warning_suppliers_count", 0),
            "total_capital": diagnosis.get("total_capital_required", 0),
            "suppliers": [
                {"name": s["supplier_name"], "urgency": s["urgency"], "cost": s["estimated_total_cost"], "skus": s["skus_in_breach"]}
                for s in diagnosis.get("suppliers", []) if s["urgency"] in ("CRITICAL", "WARNING")
            ][:6]
        }

        breach_suppliers = [s for s in diagnosis.get("suppliers", []) if s["urgency"] in ("CRITICAL", "WARNING")]
        if not breach_suppliers:
            reply_text = f"🟢 *Abastecimiento Saludable*: Ningún proveedor presenta quiebre crítico ni riesgo de agotamiento proyectado para los próximos días."
        else:
            blocks = []
            for s in breach_suppliers[:5]:
                badge = "🔴 *Quiebre Inmediato*" if s["urgency"] == "CRITICAL" else "🟡 *En Riesgo*"
                blocks.append(f"{badge}: *{s['supplier_name']}*\n   └ {s['skus_in_breach']} SKUs en déficit | ~${s['estimated_total_cost']:,.2f} USD")

            total_cap = diagnosis.get("total_capital_required", 0)
            reply_text = (
                f"📊 *Diagnóstico de Abastecimiento (Clara Compras)*\n\n"
                f"Se detectaron *{len(breach_suppliers)} proveedores* que requieren reposición:\n\n"
                + "\n\n".join(blocks) +
                f"\n\n💰 *Inversión Total Requerida:* ${total_cap:,.2f} USD\n\n"
                f"_💡 Para generar un borrador, indícame: 'Clara, genera la orden de [Nombre Proveedor]'_"
            )

    elif any(w in lower_text for w in ["negativo", "negativa", "saldo negativo", "existencia negativa", "existencias negativas", "quiebre"]):
        tool_executed = "audit_negative_stock"
        negatives = execute_negative_stock_lookup(db)
        data_context = {"negative_items": negatives, "count": len(negatives)}
        
        # Fallback determinístico
        if not negatives:
            reply_text = f"✅ *Almacenes Saludables*: No detecté existencias negativas en ninguna sucursal activa."
        else:
            lines = [f"• *{item['product']}* ({item['sku']}) en *{item['facility']}*: `{item['quantity_negative']}` uds" for item in negatives[:8]]
            reply_text = (
                f"🚨 *Alerta de Existencias Negativas*\n"
                f"Hola {user.full_name}, detecté *{len(negatives)} items* en saldo negativo:\n\n"
                + "\n".join(lines) +
                f"\n\n_He generado borradores de ajuste preventivo para revisión del supervisor._"
            )

    elif any(w in lower_text for w in ["concilia", "pendiente", "odc sin conciliar", "factura"]):
        tool_executed = "audit_unreconciled_orders"
        orders = execute_unreconciled_orders_lookup(db)
        data_context = {"unreconciled_orders": orders, "count": len(orders)}
        
        if not orders:
            reply_text = f"✅ *Conciliaciones al día*: No hay órdenes de compra pendientes de conciliación física/fiscal."
        else:
            lines = [f"• *{o['order_number']}* ({o['supplier']}) - Status: `{o['status']}` | Conciliación: `{o['reconciliation_status']}` | ${o['total_usd']:,.2f}" for o in orders[:5]]
            reply_text = (
                f"📋 *Órdenes Pendientes de Conciliación*\n"
                f"Se registran *{len(orders)} órdenes* pendientes de matching 3-vías:\n\n"
                + "\n".join(lines) +
                f"\n\n_Te sugiero revisar con recepción de almacén y compras para conciliar facturas._"
            )

    elif any(w in lower_text for w in ["devolucion", "devolución", "merma", "dañado", "scrap"]):
        tool_executed = "audit_dock_returns"
        returns = execute_returns_lookup(db)
        data_context = {"pending_returns": returns, "count": len(returns)}
        
        if not returns:
            reply_text = f"✅ *Muelle Limpio*: No hay devoluciones a proveedores ni mermas en espera de despacho."
        else:
            lines = [f"• Devolución *#{r['return_number']}* - Motivo: {r['reason']} (Estado: `{r['status']}`)" for r in returns[:5]]
            reply_text = (
                f"📦 *Devoluciones y Mermas Pendientes*\n"
                f"Existen *{len(returns)} registros* en muelle esperando despacho:\n\n"
                + "\n".join(lines)
            )

    elif any(w in lower_text for w in ["stock", "existencia", "cuanto hay", "cuánto hay", "disponible", "tienes"]):
        tool_executed = "query_stock"
        # Extraer término de búsqueda eliminando palabras comunes y signos de puntuación
        clean_query = re.sub(r"(?:\b(?:stock|existencias?|cu[aá]nt[oa]s?|tenemos|tienes|queda|hay|de|del|el|la|los|las|un|una|unos|unas)\b|[¿\?!¡,])", " ", lower_text)
        clean_query = " ".join(clean_query.split())
        if not clean_query:
            clean_query = "a"  # Búsqueda general
            
        stock_results = execute_stock_lookup(clean_query, db, limit=5)
        data_context = {"query": clean_query, "results": stock_results}
        
        if not stock_results:
            reply_text = f"🔍 No encontré productos que coincidan con *'{clean_query}'* en el catálogo del ERP."
        else:
            blocks = []
            for r in stock_results:
                facs = ", ".join([f"{f['facility']}: *{f['available']:.0f}* disp" for f in r["stock_by_facility"]]) or "Sin stock físico"
                blocks.append(f"📦 *{r['product_name']}* (`{r['sku']}`)\n   └ {facs}")
            reply_text = f"📊 *Consulta de Existencias para '{clean_query}':*\n\n" + "\n\n".join(blocks)

    else:
        tool_executed = "general_assistance"
        data_context = {"general_info": "Asistente operativo de almacén y compras"}
        reply_text = (
            f"👋 Hola *{user.full_name}*, soy *{worker.display_title}*.\n\n"
            f"Puedo apoyarte en tiempo real con:\n"
            f"• 📊 *Diagnóstico de quiebres*: '¿Qué proveedores están en quiebre?'\n"
            f"• ⚡ *Generar ODC*: 'Clara, genera la orden para [Proveedor]'\n"
            f"• 🚨 *Existencias negativas*: 'Revisa saldos negativos'\n"
            f"• 📦 *Consulta de stock*: 'Stock de cerveza pilsen'\n"
            f"• 📋 *Órdenes de compra*: 'Órdenes sin conciliar'\n"
            f"• 🔄 *Devoluciones*: 'Devoluciones en muelle'\n\n"
            f"¿Qué deseas consultar?"
        )

    # 6. Intentar enriquecer con Gemini si está disponible
    gemini_styled = call_gemini_format(worker, user.full_name, raw_text, data_context)
    if gemini_styled:
        reply_text = gemini_styled

    # Registrar mensaje saliente del trabajador
    outgoing_msg = DigitalWorkerMessage(
        conversation_id=conv.id,
        sender_type="WORKER",
        content=reply_text,
        tool_calls={"tool": tool_executed, "context_size": len(str(data_context))}
    )
    db.add(outgoing_msg)
    db.commit()

    return {
        "reply": reply_text,
        "authenticated": True,
        "tool": tool_executed,
        "worker_name": worker.display_title,
        "user_name": user.full_name
    }
