"""
Servicio NLP de Extracción de Palabras Clave y Búsqueda Inteligente de Productos
Especializado en consultas en lenguaje natural en español para los Usuarios Digitales de Neo ERP
(Clara, Valeria, Arturo, Dante).
"""

import re
import logging
import itertools
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.inventory import ProductVariant, Product, ProductBarcode
from app.models.purchasing import SupplierProduct

logger = logging.getLogger(__name__)

SPANISH_STOP_WORDS = {
    # Saludos y cortesías
    'hola', 'buenos', 'buenas', 'buen', 'dia', 'dias', 'día', 'días',
    'tarde', 'tardes', 'noche', 'noches', 'saludo', 'saludos',
    'estimado', 'estimada', 'estimados', 'estimadas', 'amigo', 'amiga',
    'por', 'favor', 'porfa', 'porfavor', 'plis', 'please', 'gracias', 'muchas',
    'agradecido', 'agradecida', 'saludos',

    # Nombres de asistentes y sistema
    'clara', 'arturo', 'valeria', 'dante', 'bot', 'asistente', 'robot', 'agente', 'neo', 'erp',

    # Pronombres y posesivos
    'me', 'te', 'le', 'nos', 'les', 'se', 'mi', 'mis', 'mio', 'mío', 'mia', 'mía',
    'tu', 'tus', 'tuyo', 'tuya', 'su', 'sus', 'suyo', 'suya', 'yo', 'ella', 'ello',
    'nosotros', 'nosotras', 'ellos', 'ellas',

    # Verbos modales, peticiones y estados
    'puedes', 'podrias', 'podrías', 'puede', 'podria', 'podría', 'pudieras',
    'dar', 'darme', 'indicar', 'indicarme', 'decir', 'decirme', 'mostrar', 'mostrarme',
    'ver', 'pasar', 'pasarme', 'consultar', 'buscar', 'ayudame', 'ayúdame', 'ayudar',
    'apoyo', 'quisiera', 'deseo', 'necesito', 'saber', 'dime', 'cuentame', 'cuéntame',
    'informar', 'informame', 'infórmame', 'revisar', 'chequear', 'validar',
    'estas', 'estás', 'estan', 'están', 'esta', 'está', 'este', 'bien', 'mal',
    'hoy', 'ayer', 'mañana', 'ahora', 'actual', 'actualmente',

    # Preguntas e interrogativos
    'que', 'qué', 'cual', 'cuál', 'cuales', 'cuáles', 'como', 'cómo',
    'cuanto', 'cuánto', 'cuanta', 'cuánta', 'cuantos', 'cuántos', 'cuantas', 'cuántas',
    'donde', 'dónde', 'quien', 'quién', 'cuando', 'cuándo',

    # Artículos, preposiciones y conjunciones
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'en', 'para', 'con', 'sin', 'sobre', 'a', 'y', 'e', 'o', 'u', 'ni', 'pero',

    # Palabras de dominio ERP / intenciones de consulta
    'existencia', 'existencias', 'stock', 'inventario', 'inventarios',
    'disponible', 'disponibles', 'disponibilidad', 'quedan', 'queda', 'hay',
    'tenemos', 'tiene', 'tienen', 'haber',
    'precio', 'precios', 'costo', 'costos', 'coste', 'costes', 'pvp',
    'margen', 'margenes', 'márgenes', 'valor', 'valores', 'cotizacion', 'cotización',
    'cuesta', 'cuestan', 'vale', 'valen', 'venta', 'ventas', 'compra', 'compras',
    'producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos',
    'item', 'items', 'sede', 'sedes', 'tienda', 'tiendas', 'almacen', 'almacenes', 'almacén',
    'sucursal', 'sucursales', 'bodega', 'bodegas', 'reporte', 'reportes', 'resumen',
    'status', 'estado', 'estados', 'situacion', 'situación', 'info', 'informacion', 'información',
    'detalle', 'detalles', 'ficha', 'fichas', 'rotacion', 'rotación'
}


def extract_product_search_tokens(text: str) -> List[str]:
    """
    Limpia texto en lenguaje natural eliminando puntuación, saludos y palabras vacías (stop-words),
    extrayendo únicamente los términos sustantivos relevantes para buscar un producto en catálogo.
    Ej: "Hola Clara, por favor me puedes dar la existencia de la leche completa la campesina"
    -> ['leche', 'completa', 'campesina']
    """
    if not text:
        return []

    # Reemplazar puntuación por espacios, preservando guiones internos en códigos (como PRD-119313)
    clean = re.sub(r'[^\w\s-]', ' ', text, flags=re.UNICODE).lower()
    raw_tokens = clean.split()

    meaningful = [
        t for t in raw_tokens
        if t not in SPANISH_STOP_WORDS and len(t) > 1
    ]
    return meaningful


def search_product_variants(
    db: Session,
    query_text: str,
    limit: int = 5
) -> List[ProductVariant]:
    """
    Búsqueda inteligente y tolerante a lenguaje natural de variantes de producto en Neo ERP.
    1. Si hay código de barras numérico (>= 7 dígitos), búsqueda directa por barcode.
    2. Si hay SKU explícito (prefijo PRD- o formato con guion), búsqueda por SKU.
    3. Extracción de tokens significativos (eliminando saludos, verbos y palabras de intención).
    4. Búsqueda AND (deben coincidir todos los tokens en SKU o Nombre de Producto).
    5. Fallback a combinaciones de (N-1) tokens si no hubo coincidencia completa.
    6. Fallback al token más específico / largo (marca o identificador).
    7. Fallback por SKU de proveedor.
    """
    clean_q = (query_text or "").strip()
    if not clean_q:
        return []

    try:
        # 1. Búsqueda por Código de Barras numérico
        digit_match = re.search(r'\b\d{7,14}\b', clean_q)
        if digit_match:
            bc_val = digit_match.group(0)
            bc = db.query(ProductBarcode).filter(ProductBarcode.barcode == bc_val).first()
            if bc and bc.variant and bc.variant.is_active:
                return [bc.variant]
            v = db.query(ProductVariant).filter(
                ProductVariant.barcode == bc_val,
                ProductVariant.is_active == True
            ).first()
            if v:
                return [v]

        # 2. Búsqueda por SKU exacto o explícito (ej. PRD-119313)
        sku_match = re.search(r'\b(PRD-[0-9A-Z-]+)\b', clean_q, flags=re.IGNORECASE)
        if sku_match:
            sku_val = sku_match.group(0)
            v = db.query(ProductVariant).filter(
                ProductVariant.sku.ilike(sku_val),
                ProductVariant.is_active == True
            ).first()
            if v:
                return [v]

        # 3. Extracción de tokens significativos
        tokens = extract_product_search_tokens(clean_q)

        # Si no quedaron tokens después de filtrar stop words, pero el query tiene caracteres válidos,
        # usar los tokens originales mayores a 2 caracteres
        if not tokens:
            tokens = [t for t in re.sub(r'[^\w\s-]', ' ', clean_q).lower().split() if len(t) > 2]

        if not tokens:
            return []

        # 4. Estrategia Principal: Coincidencia AND de todos los tokens
        and_filters = [
            or_(
                ProductVariant.sku.ilike(f"%{t}%"),
                Product.name.ilike(f"%{t}%")
            )
            for t in tokens
        ]
        variants = db.query(ProductVariant).join(Product).filter(
            ProductVariant.is_active == True,
            and_(*and_filters)
        ).limit(limit).all()

        if variants:
            logger.info(f"[NLP SEARCH] Coincidencia AND exacta con tokens {tokens}: {len(variants)} variantes encontradas.")
            return variants

        # 5. Estrategia Fallback 1: Si hay >= 3 tokens y 0 resultados, probar combinaciones de (N-1) tokens
        # priorizando los tokens más largos (generalmente marcas o especificaciones clave)
        if len(tokens) >= 3:
            sorted_tokens = sorted(tokens, key=len, reverse=True)
            for subset in itertools.combinations(sorted_tokens, len(tokens) - 1):
                sub_filters = [
                    or_(
                        ProductVariant.sku.ilike(f"%{t}%"),
                        Product.name.ilike(f"%{t}%")
                    )
                    for t in subset
                ]
                sub_variants = db.query(ProductVariant).join(Product).filter(
                    ProductVariant.is_active == True,
                    and_(*sub_filters)
                ).limit(limit).all()
                if sub_variants:
                    logger.info(f"[NLP SEARCH] Coincidencia Fallback con subset {subset}: {len(sub_variants)} variantes encontradas.")
                    return sub_variants

        # 6. Estrategia Fallback 2: Coincidencia por el token más largo (mínimo 4 caracteres, ej. marca 'campesina', 'mavesa')
        if len(tokens) >= 2:
            longest = max(tokens, key=len)
            if len(longest) >= 4:
                v_long = db.query(ProductVariant).join(Product).filter(
                    ProductVariant.is_active == True,
                    or_(
                        ProductVariant.sku.ilike(f"%{longest}%"),
                        Product.name.ilike(f"%{longest}%")
                    )
                ).limit(limit).all()
                if v_long:
                    logger.info(f"[NLP SEARCH] Coincidencia Fallback token más largo '{longest}': {len(v_long)} variantes encontradas.")
                    return v_long

        # 7. Estrategia Fallback 3: Búsqueda por SKU de Proveedor
        for t in tokens:
            if len(t) >= 3:
                sp = db.query(SupplierProduct).filter(
                    SupplierProduct.is_active == True,
                    SupplierProduct.supplier_sku.ilike(f"%{t}%")
                ).first()
                if sp and sp.variant_id:
                    var = db.query(ProductVariant).filter(
                        ProductVariant.id == sp.variant_id,
                        ProductVariant.is_active == True
                    ).first()
                    if var:
                        return [var]

        return []

    except Exception as e:
        logger.error(f"[NLP SEARCH] Error en search_product_variants con '{query_text}': {e}", exc_info=True)
        return []
