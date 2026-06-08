import os
import urllib.request
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Any
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.api import deps
from app.models.sales import Customer, Document, DocumentLine, DocumentType, DocumentState
from app.models.inventory import Product, ProductVariant, Category, InventorySnapshot, StockMove, Location
from app.models.core import User, Role, SystemSettings, Currency
from app.core import security

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Schemas ---
class B2BRegisterInput(BaseModel):
    rif: str
    name: str
    email: EmailStr
    phone: str
    shipping_address: str

class CustomerResponse(BaseModel):
    id: int
    rif: str
    name: str
    email: Optional[str]
    approval_status: str
    wholesaler_tier_id: Optional[int]

class ApproveCustomerInput(BaseModel):
    wholesaler_tier_id: Optional[int] = None

class CatalogItem(BaseModel):
    product_id: int
    variant_id: int
    sku: str
    name: str
    brand: Optional[str]
    model: Optional[str]
    category_name: str
    price_usd: float
    price_ves: float
    web_stock: float
    images: List[str]
    qty_per_pack: float = 1.0

class OrderLineInput(BaseModel):
    variant_id: int
    quantity: float

class OrderCreateInput(BaseModel):
    lines: List[OrderLineInput]

class OrderResponse(BaseModel):
    id: int
    document_number: str
    subtotal: float
    tax_amount: float
    total_amount: float
    state: str

class RecommendationItem(BaseModel):
    sku: str
    name: str
    reason: str
    suggested_qty: float

# --- Helpers ---
def get_stock_real(db: Session, variant_id: int) -> float:
    """
    Suma existencias físicas reales en ubicaciones INTERNAL.
    """
    incoming = db.query(func.sum(StockMove.quantity_done))\
        .join(Location, StockMove.location_dest_id == Location.id)\
        .filter(
            StockMove.product_id == variant_id,
            StockMove.state == 'DONE',
            Location.usage == 'INTERNAL'
        ).scalar()
    incoming = float(incoming) if incoming else 0.0

    outgoing = db.query(func.sum(StockMove.quantity_done))\
        .join(Location, StockMove.location_src_id == Location.id)\
        .filter(
            StockMove.product_id == variant_id,
            StockMove.state == 'DONE',
            Location.usage == 'INTERNAL'
        ).scalar()
    outgoing = float(outgoing) if outgoing else 0.0
        
    return max(0.0, incoming - outgoing)

def get_committed_stock(db: Session, variant_id: int) -> float:
    """
    Suma las cantidades de pedidos web u órdenes de venta en borrador/confirmadas.
    """
    committed = db.query(func.sum(DocumentLine.quantity))\
        .join(Document, DocumentLine.document_id == Document.id)\
        .filter(
            DocumentLine.variant_id == variant_id,
            Document.type == DocumentType.ORDER,
            Document.state.in_([DocumentState.DRAFT, DocumentState.CONFIRMED])
        ).scalar()
    return float(committed) if committed else 0.0

# --- Endpoints ---

@router.post("/register", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def register_wholesaler(
    *,
    db: Session = Depends(deps.get_db),
    reg_in: B2BRegisterInput
):
    """
    Solicitud de registro B2B para Mayoristas. Se guarda en estado PENDING_APPROVAL.
    """
    existing = db.query(Customer).filter(Customer.rif == reg_in.rif).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Ya existe un cliente registrado con este RIF."
        )

    customer = Customer(
        rif=reg_in.rif,
        name=reg_in.name,
        email=reg_in.email,
        phone=reg_in.phone,
        address=reg_in.shipping_address,
        shipping_address=reg_in.shipping_address,
        approval_status="PENDING_APPROVAL"
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

@router.get("/pending-customers", response_model=List[CustomerResponse])
def get_pending_customers(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Obtiene los clientes mayoristas pendientes por aprobación (Solo administradores/gerentes).
    """
    return db.query(Customer).filter(Customer.approval_status == "PENDING_APPROVAL").all()

@router.post("/customers/{customer_id}/approve", response_model=CustomerResponse)
def approve_wholesaler(
    *,
    db: Session = Depends(deps.get_db),
    customer_id: int,
    approve_in: ApproveCustomerInput,
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Aprueba la cuenta del mayorista y le crea credenciales de acceso con el rol WHOLESALER.
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
        
    if customer.approval_status == "APPROVED":
        raise HTTPException(status_code=400, detail="Este cliente ya está aprobado.")

    # 1. Actualizar estado del cliente
    customer.approval_status = "APPROVED"
    customer.wholesaler_tier_id = approve_in.wholesaler_tier_id
    db.add(customer)

    # 2. Buscar o crear Rol WHOLESALER
    wholesaler_role = db.query(Role).filter(Role.name == "WHOLESALER").first()
    if not wholesaler_role:
        wholesaler_role = Role(
            name="WHOLESALER",
            description="Cliente Mayorista B2B con acceso al portal de compras",
            is_active=True
        )
        db.add(wholesaler_role)
        db.flush()

    # 3. Crear credenciales de acceso para el portal
    user = db.query(User).filter(User.email == customer.email).first()
    temp_pass = "morpheus123" # Contraseña temporal por defecto
    
    if not user:
        # Registrar el usuario
        hashed_password = security.get_password_hash(temp_pass)
        user = User(
            email=customer.email,
            hashed_password=hashed_password,
            full_name=customer.name,
            is_active=True,
            is_superuser=False
        )
        db.add(user)
        db.flush()
        
        # Asignar rol
        from app.models.core import UserRole
        ur = UserRole(user_id=user.id, role_id=wholesaler_role.id)
        db.add(ur)
    
    db.commit()
    db.refresh(customer)

    # Mock de envío de Email
    email_body = f"""
    ✉️ [MOCK EMAIL] ENVIADO A: {customer.email}
    📌 ASUNTO: ¡Bienvenido a Morpheus Soft Wholesale Portal!
    
    Estimado {customer.name},
    Su afiliación B2B ha sido APROBADA con éxito.
    Puede ingresar al portal de mayoristas con las siguientes credenciales:
    
    🔗 URL: http://localhost:3000/login
    👤 Usuario: {customer.email}
    🔑 Contraseña Temporal: {temp_pass} (Por seguridad, cámbiela al ingresar).
    
    ¡Gracias por hacer negocios con nosotros!
    """
    print(email_body)
    logger.info(f"Mock email de aprobación enviado a {customer.email}")

    return customer

@router.get("/catalog", response_model=List[CatalogItem])
def get_b2b_catalog(
    db: Session = Depends(deps.get_db),
    query: Optional[str] = None,
    category_id: Optional[int] = None,
    brand: Optional[str] = None
):
    """
    Retorna el catálogo para mayoristas.
    Aplica filtros de búsqueda por facetas.
    Fórmula de stock protegido: MAX(0, (Stock_Real - Comprometido) * (Percent / 100) - Safety_Stock)
    """
    # Leer parámetros globales de protección de stock
    settings = db.query(SystemSettings).first()
    percent = float(settings.b2b_web_stock_percent) if settings and settings.b2b_web_stock_percent is not None else 30.0
    safety = float(settings.b2b_safety_stock) if settings and settings.b2b_safety_stock is not None else 0.0

    # Tasa del día
    ves_curr = db.query(Currency).filter(Currency.code == "VES").first()
    rate = ves_curr.exchange_rate if ves_curr else Decimal("40.0")

    # Filtrar productos marcados para web y activos
    products_q = db.query(Product).filter(Product.sell_on_web == True, Product.is_active == True)
    
    if query:
        products_q = products_q.filter(
            (Product.name.ilike(f"%{query}%")) | 
            (Product.brand.ilike(f"%{query}%")) | 
            (Product.model.ilike(f"%{query}%"))
        )
    if category_id:
        products_q = products_q.filter(Product.category_id == category_id)
    if brand:
        products_q = products_q.filter(Product.brand.ilike(brand))

    products = products_q.all()
    catalog_items = []

    for prod in products:
        category_name = prod.category.name if prod.category else "General"
        
        # En el MVP se asume que listamos las variantes
        for var in prod.variants:
            if not var.is_active:
                continue
                
            # Aplicar cálculo de stock web protegido
            stock_real = get_stock_real(db, var.id)
            committed = get_committed_stock(db, var.id)
            web_stock = max(0.0, (stock_real - committed) * (percent / 100.0) - safety)

            price_usd = float(var.sales_price or 0.0)
            price_ves = price_usd * float(rate)

            # Cargar imágenes
            images_list = prod.images if prod.images else []
            if prod.image_main:
                images_list = [prod.image_main] + [img for img in images_list if img != prod.image_main]

            qty_per_pack = 1.0
            if prod.packagings:
                qty_per_pack = float(prod.packagings[0].qty_per_unit)

            catalog_items.append(CatalogItem(
                product_id=prod.id,
                variant_id=var.id,
                sku=var.sku,
                name=f"{prod.name} {var.part_number or ''}".strip(),
                brand=prod.brand,
                model=prod.model,
                category_name=category_name,
                price_usd=price_usd,
                price_ves=price_ves,
                web_stock=web_stock,
                images=images_list,
                qty_per_pack=qty_per_pack
            ))

    return catalog_items

@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_web_order(
    *,
    db: Session = Depends(deps.get_db),
    order_in: OrderCreateInput,
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Crea un pedido Borrador (Draft Order) marcado como is_web_order = True.
    """
    # Encontrar cliente asociado al email del usuario mayorista
    customer = db.query(Customer).filter(Customer.email == current_user.email).first()
    if not customer:
        raise HTTPException(
            status_code=400,
            detail="Su usuario de acceso no está vinculado a ninguna ficha de cliente B2B."
        )

    # Tasa del día
    ves_curr = db.query(Currency).filter(Currency.code == "VES").first()
    rate = ves_curr.exchange_rate if ves_curr else Decimal("40.0")

    # Crear Cabecera del Documento
    doc_number = f"WEB-ORD-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    document = Document(
        document_number=doc_number,
        type=DocumentType.ORDER,
        state=DocumentState.DRAFT,
        customer_id=customer.id,
        facility_id=1, # Sucursal por defecto
        currency_id=1, # Moneda por defecto USD
        exchange_rate=rate,
        is_web_order=True,
        subtotal=Decimal("0.0"),
        tax_amount=Decimal("0.0"),
        total_amount=Decimal("0.0")
    )
    db.add(document)
    db.flush() # Obtener ID

    subtotal = Decimal("0.0")
    tax_amount = Decimal("0.0")

    # Crear Líneas de Pedido
    for line in order_in.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        if not variant:
            db.rollback()
            raise HTTPException(
                status_code=404,
                detail=f"Variante con ID {line.variant_id} no encontrada en catálogo."
            )
            
        qty = Decimal(str(line.quantity))
        price_unit = variant.sales_price or Decimal("0.0")
        
        # Calcular impuesto si aplica
        # Consultar la tasa del producto en la cabecera
        tax_pct = Decimal("0.16") # IVA por defecto 16% en Venezuela
        if variant.product and variant.product.tax_id:
            from app.models.core import Tribute
            tribute = db.query(Tribute).get(variant.product.tax_id)
            if tribute:
                tax_pct = tribute.rate / Decimal("100.0")
                
        line_sub = qty * price_unit
        line_tax = line_sub * tax_pct
        line_total = line_sub + line_tax

        doc_line = DocumentLine(
            document_id=document.id,
            variant_id=variant.id,
            quantity=qty,
            unit_price=price_unit,
            tax_pct=float(tax_pct * 100),
            line_total=line_total
        )
        db.add(doc_line)

        subtotal += line_sub
        tax_amount += line_tax

    # Actualizar montos en cabecera
    document.subtotal = subtotal
    document.tax_amount = tax_amount
    document.total_amount = subtotal + tax_amount
    
    db.commit()
    db.refresh(document)

    # Email de confirmación de pedido
    email_body = f"""
    ✉️ [MOCK EMAIL] ENVIADO A: {customer.email}
    📌 ASUNTO: Pedido Recibido - Morpheus B2B #{document.document_number}
    
    Estimado {customer.name},
    Hemos recibido su pedido borrador con éxito en el sistema.
    Total Pedido: {float(document.total_amount):,.2f} USD ({float(document.total_amount * rate):,.2f} VES).
    El departamento de facturación y cobranza se comunicará con usted para concretar el cobro y coordinar el despacho.
    """
    print(email_body)
    logger.info(f"Pedido B2B creado. Notificación simulada enviada a {customer.email}")

    return document

@router.get("/recommendations", response_model=List[RecommendationItem])
def get_b2b_recommendations(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Obtiene recomendaciones de recompra e incrementales basadas en IA para el cliente mayorista.
    Analiza el historial e invoca a Gemini. Si falla, genera recomendaciones inteligentes por reglas.
    """
    # Encontrar cliente
    customer = db.query(Customer).filter(Customer.email == current_user.email).first()
    if not customer:
        raise HTTPException(
            status_code=400,
            detail="Usuario sin cliente B2B asignado."
        )

    # 1. Obtener historial de compras del cliente
    history_q = db.query(
        ProductVariant.sku,
        Product.name,
        func.sum(DocumentLine.quantity).label('total_qty')
    ).join(DocumentLine, ProductVariant.id == DocumentLine.variant_id)\
     .join(Document, DocumentLine.document_id == Document.id)\
     .join(Product, ProductVariant.product_id == Product.id)\
     .filter(
         Document.customer_id == customer.id,
         Document.type == DocumentType.INVOICE,
         Document.state.in_([DocumentState.CONFIRMED, DocumentState.PAID])
     ).group_by(ProductVariant.sku, Product.name)\
      .order_by(func.sum(DocumentLine.quantity).desc())\
      .limit(10).all()

    purchased_items = [{"sku": r[0], "name": r[1], "qty": float(r[2])} for r in history_q]

    # 2. Obtener productos activos en web
    web_products = db.query(ProductVariant.sku, Product.name)\
        .join(Product, ProductVariant.product_id == Product.id)\
        .filter(Product.sell_on_web == True, Product.is_active == True).limit(20).all()
        
    available_catalog = [{"sku": r[0], "name": r[1]} for r in web_products]

    # Intentar llamar al API de Gemini
    from app.core.config import settings
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    gemini_success = False
    recommendations = []

    if api_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            
            prompt = (
                "Eres un agente inteligente de recomendación B2B para una tienda mayorista. "
                "Genera 3 recomendaciones de compra personalizadas para el cliente basándote en su historial de compras y el catálogo disponible. "
                "Intenta sugerir reposiciones (si ya ha comprado antes) y al menos un producto cruzado atractivo. "
                "Retorna ÚNICAMENTE un JSON válido en el cuerpo del texto con la siguiente estructura, sin bloques markdown ni formateos adicionales (directamente el JSON):\n"
                "[\n"
                "  {\n"
                "    \"sku\": \"sku_del_producto\",\n"
                "    \"name\": \"nombre_del_producto\",\n"
                "    \"reason\": \"Breve razón persuasiva de por qué debería comprarlo (ej: temporada, reposición, oferta)\",\n"
                "    \"suggested_qty\": 12\n"
                "  }\n"
                "]\n\n"
                f"Historial de compras del cliente: {json.dumps(purchased_items)}\n"
                f"Catálogo de productos disponibles para la venta web: {json.dumps(available_catalog)}\n"
            )

            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                text_content = res_data['candidates'][0]['content']['parts'][0]['text']
                rec_json = json.loads(text_content.strip())
                
                # Validar la estructura
                for item in rec_json:
                    if "sku" in item and "reason" in item:
                        # Asegurar que sugerimos cantidades numéricas razonables
                        suggested_qty = float(item.get("suggested_qty", 12.0))
                        
                        # Buscar nombre real si falta
                        name = item.get("name", "")
                        if not name:
                            matched_prod = next((p for p in available_catalog if p["sku"] == item["sku"]), None)
                            name = matched_prod["name"] if matched_prod else "Producto Sugerido"

                        recommendations.append(RecommendationItem(
                            sku=item["sku"],
                            name=name,
                            reason=item["reason"],
                            suggested_qty=suggested_qty
                        ))
                if recommendations:
                    gemini_success = True
                    logger.info("Recomendaciones generadas exitosamente con la API de Gemini.")
        except Exception as e:
            logger.warning(f"Error llamando a la API de Gemini: {e}. Activando motor de reglas local.")

    # 3. Fallback: Generador por reglas local
    if not gemini_success:
        recommendations = []
        # Sugerir los 2 productos más comprados del historial
        for idx, item in enumerate(purchased_items[:2]):
            recommendations.append(RecommendationItem(
                sku=item["sku"],
                name=item["name"],
                reason="Reposición sugerida por compras habituales con rotación recurrente.",
                suggested_qty=float(round(item["qty"] * 1.2 / 12) * 12) if item["qty"] > 12 else 12.0
            ))
            
        # Sugerir un producto cruzado disponible que el cliente NO haya comprado
        purchased_skus = {item["sku"] for item in purchased_items}
        cross_sell = next((p for p in available_catalog if p["sku"] not in purchased_skus), None)
        
        if cross_sell:
            recommendations.append(RecommendationItem(
                sku=cross_sell["sku"],
                name=cross_sell["name"],
                reason="Oferta destacada de la temporada. Excelente margen comercial para su negocio.",
                suggested_qty=12.0
            ))

    return recommendations
