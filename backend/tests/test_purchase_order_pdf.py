import io
import unittest
from decimal import Decimal
from unittest.mock import MagicMock
import pypdf

from app.models.inventory import ProductVariant, ProductPackaging, ProductBarcode, Product
from app.models.purchasing import PurchaseOrderLine
from app.services.pdf_service import resolve_line_code, PurchaseOrderPDF, generate_purchase_order_pdf
from app.api.deps import SessionLocal

class TestPurchaseOrderPDF(unittest.TestCase):
    def setUp(self):
        self.mock_db = MagicMock()
        
    def test_sku_mode_returns_sku(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 100
        variant.sku = "PRD-SKU-100"
        variant.barcode = "7590000000001"
        
        # Even if barcodes exist, sku mode must return sku
        res = resolve_line_code(self.mock_db, variant, None, 100, code_type="sku")
        self.assertEqual(res, "PRD-SKU-100")
        
        # Test case insensitivity
        res_upper = resolve_line_code(self.mock_db, variant, None, 100, code_type="SKU")
        self.assertEqual(res_upper, "PRD-SKU-100")

    def test_priority_1_pack_barcode(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 101
        variant.sku = "PRD-PACK-TEST"
        variant.barcode = None
        
        pack = MagicMock(spec=ProductPackaging)
        pack.qty_per_unit = Decimal("6.0000")
        
        # 3 barcodes: stellar (1), base barcode (1), pack barcode (6)
        bc_stellar = MagicMock(spec=ProductBarcode)
        bc_stellar.id = 1
        bc_stellar.barcode = "001234"
        bc_stellar.code_type = "STELLAR_CODE"
        bc_stellar.conversion_factor = Decimal("1.0000")
        
        bc_base = MagicMock(spec=ProductBarcode)
        bc_base.id = 2
        bc_base.barcode = "7591111111111"
        bc_base.code_type = "BARCODE"
        bc_base.conversion_factor = Decimal("1.0000")
        
        bc_pack = MagicMock(spec=ProductBarcode)
        bc_pack.id = 3
        bc_pack.barcode = "76704"
        bc_pack.code_type = "BARCODE"
        bc_pack.conversion_factor = Decimal("6.0000")
        
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            bc_stellar, bc_base, bc_pack
        ]
        
        res = resolve_line_code(self.mock_db, variant, pack, 101, code_type="barcode")
        self.assertEqual(res, "76704")

    def test_priority_2_base_unit_barcode_when_no_pack_or_no_pack_barcode(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 102
        variant.sku = "PRD-BASE-TEST"
        variant.barcode = None
        
        bc_stellar = MagicMock(spec=ProductBarcode)
        bc_stellar.id = 1
        bc_stellar.barcode = "001234"
        bc_stellar.code_type = "STELLAR_CODE"
        bc_stellar.conversion_factor = Decimal("1.0000")
        
        bc_base = MagicMock(spec=ProductBarcode)
        bc_base.id = 2
        bc_base.barcode = "7591111111111"
        bc_base.code_type = "BARCODE"
        bc_base.conversion_factor = Decimal("1.0000")
        
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            bc_stellar, bc_base
        ]
        
        # Scenario A: pack is None
        res_no_pack = resolve_line_code(self.mock_db, variant, None, 102, code_type="barcode")
        self.assertEqual(res_no_pack, "7591111111111")
        
        # Scenario B: pack exists (x12), but no x12 barcode in DB -> falls back to base unit barcode
        pack_12 = MagicMock(spec=ProductPackaging)
        pack_12.qty_per_unit = Decimal("12.0000")
        res_fallback_base = resolve_line_code(self.mock_db, variant, pack_12, 102, code_type="barcode")
        self.assertEqual(res_fallback_base, "7591111111111")

    def test_priority_3_any_barcode_fallback(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 103
        variant.sku = "PRD-ANY-TEST"
        variant.barcode = "7599999999999"
        
        bc_other = MagicMock(spec=ProductBarcode)
        bc_other.id = 1
        bc_other.barcode = "7598888888888"
        bc_other.code_type = "BARCODE"
        bc_other.conversion_factor = Decimal("24.0000")
        
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            bc_other
        ]
        
        # pack is None, no factor 1 barcode -> should return bc_other
        res = resolve_line_code(self.mock_db, variant, None, 103, code_type="barcode")
        self.assertEqual(res, "7598888888888")
        
        # If no standard barcodes in DB, fallback to variant.barcode
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        res_var = resolve_line_code(self.mock_db, variant, None, 103, code_type="barcode")
        self.assertEqual(res_var, "7599999999999")

    def test_priority_4_stellar_code_fallback(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 104
        variant.sku = "PRD-STELLAR-TEST"
        variant.barcode = None
        
        bc_stellar = MagicMock(spec=ProductBarcode)
        bc_stellar.id = 1
        bc_stellar.barcode = "005555"
        bc_stellar.code_type = "STELLAR_CODE"
        bc_stellar.conversion_factor = Decimal("1.0000")
        
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            bc_stellar
        ]
        
        res = resolve_line_code(self.mock_db, variant, None, 104, code_type="barcode")
        self.assertEqual(res, "005555")

    def test_priority_5_sku_fallback_when_no_barcodes(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 105
        variant.sku = "PRD-NO-BC"
        variant.barcode = None
        
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        
        res = resolve_line_code(self.mock_db, variant, None, 105, code_type="barcode")
        self.assertEqual(res, "PRD-NO-BC")

    def test_real_database_po_1063_pdf_generation(self):
        db = SessionLocal()
        try:
            from app.models.purchasing import PurchaseOrder
            po = db.query(PurchaseOrder).filter(PurchaseOrder.id == 1063).first()
            if not po:
                po = db.query(PurchaseOrder).order_by(PurchaseOrder.id.desc()).first()
            if not po:
                self.skipTest("No purchase orders found in database")

            pdf_barcode = generate_purchase_order_pdf(po.id, db, code_type="barcode")
            pdf_sku = generate_purchase_order_pdf(po.id, db, code_type="sku")
            
            self.assertGreater(len(pdf_barcode), 1000)
            self.assertGreater(len(pdf_sku), 1000)
            
            reader_bc = pypdf.PdfReader(io.BytesIO(pdf_barcode))
            reader_sku = pypdf.PdfReader(io.BytesIO(pdf_sku))
            
            text_bc = reader_bc.pages[0].extract_text()
            text_sku = reader_sku.pages[0].extract_text()
            
            # Header text must contain EMISOR and PROVEEDOR labels
            self.assertIn("EMISOR / FACTURAR A:", text_bc)
            self.assertIn("PROVEEDOR:", text_bc)
            self.assertIn("EMISOR / FACTURAR A:", text_sku)
            self.assertIn("PROVEEDOR:", text_sku)

            # Destination facility verification
            self.assertIn("DESPACHAR A / DESTINO:", text_bc)
            self.assertIn("DESPACHAR A / DESTINO:", text_sku)

            if po.id == 1063:
                # Line item 1 in PO 1063 has packaging pack_id 6511 (qty_per_unit=12), matching pack barcode 50065
                self.assertIn("50065", text_bc)
                self.assertIn("PRD-116013", text_sku)
                self.assertIn("PATIO TRIGAL (CAT-11) - Pto Cabello", text_bc)
                self.assertIn("PATIO TRIGAL (CAT-11) - Pto Cabello", text_sku)
            
            # Header layout verification: verify coordinates of EMISOR vs PROVEEDOR
            positions = []
            def visitor_body(text, cm, tm, font_dict, font_size):
                if text.strip():
                    x_mm = tm[4] * 25.4 / 72.0
                    y_mm = 297.0 - (tm[5] * 25.4 / 72.0)
                    positions.append((text.strip(), x_mm, y_mm))
            reader_bc.pages[0].extract_text(visitor_text=visitor_body)
            
            # EMISOR texts must be near x ~ 19 mm (inside left box 15-103)
            # PROVEEDOR texts must be near x ~ 111 mm (inside right box 107-195)
            emisor_found = False
            proveedor_found = False
            for t, x, y in positions:
                if "EMISOR" in t:
                    self.assertTrue(15 <= x <= 103, f"EMISOR x={x} out of left box")
                    emisor_found = True
                if "PROVEEDOR" in t:
                    self.assertTrue(107 <= x <= 195, f"PROVEEDOR x={x} out of right box")
                    proveedor_found = True
                if "CATANIA" in t:
                    self.assertTrue(15 <= x <= 103, f"Issuer name x={x} out of left box")
                if "VIRGEN DEL" in t:
                    self.assertTrue(107 <= x <= 195, f"Supplier name x={x} out of right box")
                    
            self.assertTrue(emisor_found)
            self.assertTrue(proveedor_found)
        finally:
            db.close()

    def test_edge_case_none_variant(self):
        res = resolve_line_code(self.mock_db, None, None, 888, code_type="barcode")
        self.assertEqual(res, "VR-888")
        
        variant_no_sku = MagicMock(spec=ProductVariant)
        variant_no_sku.id = 889
        variant_no_sku.sku = None
        variant_no_sku.barcode = None
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        res2 = resolve_line_code(self.mock_db, variant_no_sku, None, 889, code_type="barcode")
        self.assertEqual(res2, "VR-889")

    def test_edge_case_casing_and_whitespace(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 900
        variant.sku = "PRD-CASE"
        variant.barcode = None
        bc = MagicMock(spec=ProductBarcode)
        bc.id = 1
        bc.barcode = "7591234567890"
        bc.code_type = "BARCODE"
        bc.conversion_factor = Decimal("1.0")
        self.mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [bc]
        
        # Leading/trailing whitespace and uppercase
        self.assertEqual(resolve_line_code(self.mock_db, variant, None, 900, code_type="  BARCODE  "), "7591234567890")
        self.assertEqual(resolve_line_code(self.mock_db, variant, None, 900, code_type="  SKU  "), "PRD-CASE")
        # None defaults to barcode mode
        self.assertEqual(resolve_line_code(self.mock_db, variant, None, 900, code_type=None), "7591234567890")

    def test_edge_case_extreme_string_lengths_in_pdf(self):
        # Verify that generating a PO with very long strings doesn't fail or overlap
        from app.models.purchasing import PurchaseOrder
        from app.models.core import Supplier, Facility, Company, Currency
        from datetime import datetime

        db = MagicMock()
        mock_po = MagicMock(spec=PurchaseOrder)
        mock_po.id = 9999
        mock_po.reference = "ODC-EXTREME-TEST"
        mock_po.supplier_id = 1
        mock_po.dest_facility_id = 1
        mock_po.currency_id = 1
        mock_po.created_at = datetime(2026, 9, 9)
        mock_po.expiration_date = datetime(2026, 9, 30)
        mock_po.buyer_id = None
        mock_po.notes = "Test notes" * 20
        mock_po.invoice_discount_str = "5"
        mock_po.condition_discount_str = "2"
        mock_po.exchange_rate = Decimal("1.0")

        mock_supp = MagicMock(spec=Supplier)
        mock_supp.id = 1
        mock_supp.name = "A" * 120  # Very long supplier name
        mock_supp.tax_id = "J-99999999-9"
        mock_supp.fiscal_address = "Calle Super Larga con Mucho Texto Informativo " * 5  # > 200 chars
        mock_supp.commercial_email = "superlongemailaddress_testing_overflow@corporation.com"
        mock_supp.currency_id = 1

        mock_fac = MagicMock(spec=Facility)
        mock_fac.id = 1
        mock_fac.company_id = 1
        mock_fac.address = "Avenida Principal Edificio Central Caracas " * 4

        mock_comp = MagicMock(spec=Company)
        mock_comp.id = 1
        mock_comp.name = "EMPRESA MATRIZ GIGANTE DE VENEZUELA C.A. " * 3
        mock_comp.tax_id = "J-11111111-1"

        mock_curr = MagicMock(spec=Currency)
        mock_curr.id = 1
        mock_curr.code = "USD"
        mock_curr.symbol = "$"
        mock_curr.decimal_places = 2

        line = MagicMock(spec=PurchaseOrderLine)
        line.id = 1
        line.variant_id = 10
        line.pack_id = None
        line.qty_ordered = Decimal("10")
        line.expected_base_qty = Decimal("10")
        line.unit_cost = Decimal("2.50")
        line.line_discount_str = "0"
        mock_po.lines = [line]

        def query_side_effect(model):
            q = MagicMock()
            if model == PurchaseOrder:
                q.filter.return_value.first.return_value = mock_po
            elif model == Supplier:
                q.filter.return_value.first.return_value = mock_supp
            elif model == Facility:
                q.filter.return_value.first.return_value = mock_fac
            elif model == Company:
                q.filter.return_value.first.return_value = mock_comp
            elif model == Currency:
                q.filter.return_value.first.return_value = mock_curr
            elif model == ProductVariant:
                var = MagicMock(spec=ProductVariant)
                var.id = 10
                var.sku = "SKU-EXTREME"
                var.barcode = None
                var.product_id = 5
                q.filter.return_value.first.return_value = var
            elif model == ProductBarcode:
                bc = MagicMock(spec=ProductBarcode)
                bc.id = 1
                bc.barcode = "7599999999999"
                bc.code_type = "BARCODE"
                bc.conversion_factor = Decimal("1.0")
                q.filter.return_value.order_by.return_value.all.return_value = [bc]
            elif model == ProductPackaging:
                q.filter.return_value.first.return_value = None
            else:
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side_effect

        pdf_bytes = generate_purchase_order_pdf(9999, db, code_type="barcode")
        self.assertGreater(len(pdf_bytes), 1000)
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        self.assertGreaterEqual(len(reader.pages), 1)

    def test_unicode_characters_in_pdf_no_crash(self):
        # Verify that non-latin-1 characters (smart quotes, dashes, euro, etc.) do NOT crash FPDF
        from app.models.purchasing import PurchaseOrder
        from app.models.core import Supplier, Facility, Company, Currency
        from datetime import datetime

        db = MagicMock()
        mock_po = MagicMock(spec=PurchaseOrder)
        mock_po.id = 7777
        mock_po.reference = "ODC-UNICODE-TEST"
        mock_po.supplier_id = 1
        mock_po.dest_facility_id = 1
        mock_po.currency_id = 1
        mock_po.created_at = datetime(2026, 9, 9)
        mock_po.expiration_date = datetime(2026, 9, 30)
        mock_po.buyer_id = None
        mock_po.notes = "Entrega con certificación ISO – 100% “Garantizado” • €uro"
        mock_po.invoice_discount_str = "0"
        mock_po.condition_discount_str = "0"
        mock_po.exchange_rate = Decimal("1.0")

        mock_supp = MagicMock(spec=Supplier)
        mock_supp.id = 1
        mock_supp.name = "Distribuidora “El Triunfo” C.A."
        mock_supp.tax_id = "J-88888888-8"
        mock_supp.fiscal_address = "Av. Bolívar – Edif. Las Torres, Nivel 1 • Caracas"
        mock_supp.commercial_email = "contacto@eltriunfo.com"
        mock_supp.currency_id = 1

        mock_fac = MagicMock(spec=Facility)
        mock_fac.id = 1
        mock_fac.company_id = 1
        mock_fac.address = "Sede Principal – Edif. Corporativo"

        mock_comp = MagicMock(spec=Company)
        mock_comp.id = 1
        mock_comp.name = "NEO SOLUTIONS C.A. – MATRIZ"
        mock_comp.tax_id = "J-31415926-9"

        mock_curr = MagicMock(spec=Currency)
        mock_curr.id = 1
        mock_curr.code = "USD"
        mock_curr.symbol = "$"
        mock_curr.decimal_places = 2

        line = MagicMock(spec=PurchaseOrderLine)
        line.id = 1
        line.variant_id = 10
        line.pack_id = None
        line.qty_ordered = Decimal("5")
        line.expected_base_qty = Decimal("5")
        line.unit_cost = Decimal("12.50")
        line.line_discount_str = "0"
        mock_po.lines = [line]

        def query_side_effect(model):
            q = MagicMock()
            if model == PurchaseOrder:
                q.filter.return_value.first.return_value = mock_po
            elif model == Supplier:
                q.filter.return_value.first.return_value = mock_supp
            elif model == Facility:
                q.filter.return_value.first.return_value = mock_fac
            elif model == Company:
                q.filter.return_value.first.return_value = mock_comp
            elif model == Currency:
                q.filter.return_value.first.return_value = mock_curr
            elif model == ProductVariant:
                var = MagicMock(spec=ProductVariant)
                var.id = 10
                var.sku = "PRD-UNICODE"
                var.barcode = None
                var.product_id = 5
                q.filter.return_value.first.return_value = var
            elif model == ProductBarcode:
                bc = MagicMock(spec=ProductBarcode)
                bc.id = 1
                bc.barcode = "7591234567890"
                bc.code_type = "BARCODE"
                bc.conversion_factor = Decimal("1.0")
                q.filter.return_value.order_by.return_value.all.return_value = [bc]
            elif model == ProductPackaging:
                q.filter.return_value.first.return_value = None
            elif model == Product:
                prod = MagicMock(spec=Product)
                prod.id = 5
                # Real string from database containing right single quotation mark
                prod.name = "CREMA PARA PEINAR ACEITE DE OLIVA HD COSMETIC’S 240ML"
                prod.tribute = None
                q.filter.return_value.first.return_value = prod
            else:
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side_effect

        # Generating PDF must succeed without UnicodeEncodeError
        pdf_bytes = generate_purchase_order_pdf(7777, db, code_type="barcode")
        self.assertGreater(len(pdf_bytes), 1000)

    def test_long_barcodes_not_truncated(self):
        # 16-character barcode must not be truncated with "..."
        from app.models.purchasing import PurchaseOrder
        from app.models.core import Supplier, Facility, Company, Currency
        from datetime import datetime

        db = MagicMock()
        mock_po = MagicMock(spec=PurchaseOrder)
        mock_po.id = 8888
        mock_po.reference = "ODC-LONG-BARCODE"
        mock_po.supplier_id = 1
        mock_po.dest_facility_id = 1
        mock_po.currency_id = 1
        mock_po.created_at = datetime(2026, 9, 9)
        mock_po.expiration_date = datetime(2026, 9, 30)
        mock_po.buyer_id = None
        mock_po.notes = None
        mock_po.invoice_discount_str = ""
        mock_po.condition_discount_str = ""
        mock_po.exchange_rate = Decimal("1.0")

        line = MagicMock(spec=PurchaseOrderLine)
        line.id = 1
        line.variant_id = 10
        line.pack_id = None
        line.qty_ordered = Decimal("1")
        line.expected_base_qty = Decimal("1")
        line.unit_cost = Decimal("10.0")
        line.line_discount_str = "0"
        mock_po.lines = [line]

        long_bc = "1234567890123456" # 16 chars

        def query_side_effect(model):
            q = MagicMock()
            if model == PurchaseOrder:
                q.filter.return_value.first.return_value = mock_po
            elif model == ProductVariant:
                var = MagicMock(spec=ProductVariant)
                var.id = 10
                var.sku = "PRD-LONG"
                var.barcode = None
                var.product_id = 5
                q.filter.return_value.first.return_value = var
            elif model == ProductBarcode:
                bc = MagicMock(spec=ProductBarcode)
                bc.id = 1
                bc.barcode = long_bc
                bc.code_type = "BARCODE"
                bc.conversion_factor = Decimal("1.0")
                q.filter.return_value.order_by.return_value.all.return_value = [bc]
            elif model == Product:
                prod = MagicMock(spec=Product)
                prod.id = 5
                prod.name = "Long Barcode Product"
                prod.tribute = None
                q.filter.return_value.first.return_value = prod
            else:
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side_effect
        pdf_bytes = generate_purchase_order_pdf(8888, db, code_type="barcode")
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text = reader.pages[0].extract_text()
        # The full 16-character barcode must be present in extracted text, not truncated with "..."
        self.assertIn(long_bc, text)
        self.assertNotIn(long_bc[:12] + "...", text)

    def test_multipage_pdf_repeats_headers(self):
        # 35 lines produce 2 pages; page 2 must contain table header "CÓDIGO"
        from app.models.purchasing import PurchaseOrder
        from app.models.core import Supplier, Facility, Company, Currency
        from datetime import datetime

        db = MagicMock()
        mock_po = MagicMock(spec=PurchaseOrder)
        mock_po.id = 6666
        mock_po.reference = "ODC-MULTIPAGE-TEST"
        mock_po.supplier_id = 1
        mock_po.dest_facility_id = 1
        mock_po.currency_id = 1
        mock_po.created_at = datetime(2026, 9, 9)
        mock_po.expiration_date = datetime(2026, 9, 30)
        mock_po.buyer_id = None
        mock_po.notes = None
        mock_po.invoice_discount_str = ""
        mock_po.condition_discount_str = ""
        mock_po.exchange_rate = Decimal("1.0")

        lines = []
        for i in range(35):
            l = MagicMock(spec=PurchaseOrderLine)
            l.id = i
            l.variant_id = 100 + i
            l.pack_id = None
            l.qty_ordered = Decimal("1")
            l.expected_base_qty = Decimal("1")
            l.unit_cost = Decimal("5.00")
            l.line_discount_str = "0"
            lines.append(l)
        mock_po.lines = lines

        def query_side_effect(model):
            q = MagicMock()
            if model == PurchaseOrder:
                q.filter.return_value.first.return_value = mock_po
            elif model == ProductVariant:
                v = MagicMock(spec=ProductVariant)
                v.id = 100
                v.sku = "SKU-PAGING"
                v.barcode = "759000000001"
                v.product_id = 1
                q.filter.return_value.first.return_value = v
            elif model == ProductBarcode:
                q.filter.return_value.order_by.return_value.all.return_value = []
            elif model == Product:
                p = MagicMock(spec=Product)
                p.id = 1
                p.name = "Product Line Item"
                p.tribute = None
                q.filter.return_value.first.return_value = p
            else:
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side_effect
        pdf_bytes = generate_purchase_order_pdf(6666, db, code_type="barcode")
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        self.assertGreaterEqual(len(reader.pages), 2)
        # Page 2 must contain the table header columns
        page2_text = reader.pages[1].extract_text()
        self.assertIn("CÓDIGO", page2_text)
        self.assertIn("DESCRIPCIÓN", page2_text)
        self.assertIn("SUBTOTAL", page2_text)

    def test_resolve_line_code_no_db_session(self):
        variant = MagicMock(spec=ProductVariant)
        variant.id = 555
        variant.sku = "PRD-NO-DB"
        bc = MagicMock(spec=ProductBarcode)
        bc.id = 1
        bc.barcode = "7595555555555"
        bc.code_type = "BARCODE"
        bc.conversion_factor = Decimal("1.0")
        variant.barcodes = [bc]

        # Call with db=None -> should read from variant.barcodes
        res = resolve_line_code(None, variant, None, 555, code_type="barcode")
        self.assertEqual(res, "7595555555555")

    def test_real_database_variant_122204_pack_and_base_barcodes(self):
        # Tests real database variant 122204 which has pack x6 barcode (76015) and base barcode (719503030185)
        db = SessionLocal()
        try:
            variant = db.query(ProductVariant).filter(ProductVariant.id == 122204).first()
            if variant:
                pack_6 = db.query(ProductPackaging).filter(ProductPackaging.product_id == variant.product_id).first()
                self.assertIsNotNone(pack_6)
                self.assertEqual(float(pack_6.qty_per_unit), 6.0)

                # Ordered with pack -> resolves pack barcode 76015
                code_pack = resolve_line_code(db, variant, pack_6, variant.id, code_type="barcode")
                self.assertEqual(code_pack, "76015")

                # Ordered as base unit -> resolves base unit barcode 719503030185
                code_base = resolve_line_code(db, variant, None, variant.id, code_type="barcode")
                self.assertEqual(code_base, "719503030185")

                # SKU mode -> resolves variant SKU PRD-114577
                code_sku = resolve_line_code(db, variant, pack_6, variant.id, code_type="sku")
                self.assertEqual(code_sku, "PRD-114577")
        finally:
            db.close()

    def test_destination_facility_display_variants(self):
        from app.models.purchasing import PurchaseOrder
        from app.models.core import Supplier, Facility, Company, Currency
        from datetime import datetime

        # Sub-test 1: Facility is None -> "DESPACHAR A / DESTINO: General (Libre)"
        db = MagicMock()
        mock_po = MagicMock(spec=PurchaseOrder)
        mock_po.id = 5001
        mock_po.reference = "ODC-NO-FAC"
        mock_po.supplier_id = 1
        mock_po.dest_facility_id = None
        mock_po.currency_id = 1
        mock_po.created_at = datetime(2026, 9, 9)
        mock_po.expiration_date = datetime(2026, 9, 30)
        mock_po.buyer_id = None
        mock_po.notes = None
        mock_po.invoice_discount_str = ""
        mock_po.condition_discount_str = ""
        mock_po.exchange_rate = Decimal("1.0")
        mock_po.lines = []

        mock_supp = MagicMock(spec=Supplier)
        mock_supp.id = 1
        mock_supp.name = "Test Supplier"
        mock_supp.tax_id = "J-12345678-9"
        mock_supp.fiscal_address = "Caracas"
        mock_supp.commercial_email = "supp@test.com"
        mock_supp.currency_id = 1

        mock_curr = MagicMock(spec=Currency)
        mock_curr.id = 1
        mock_curr.code = "USD"
        mock_curr.symbol = "$"
        mock_curr.decimal_places = 2

        def query_side_effect(model):
            q = MagicMock()
            if model == PurchaseOrder:
                q.filter.return_value.first.return_value = mock_po
            elif model == Supplier:
                q.filter.return_value.first.return_value = mock_supp
            elif model == Currency:
                q.filter.return_value.first.return_value = mock_curr
            elif model == Facility:
                q.filter.return_value.first.return_value = None
            elif model == Company:
                q.filter.return_value.first.return_value = None
            else:
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side_effect
        pdf_bytes = generate_purchase_order_pdf(5001, db)
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text = reader.pages[0].extract_text()
        self.assertIn("DESPACHAR A / DESTINO: General (Libre)", text)

        # Sub-test 2: Facility with name, code, address
        mock_po.dest_facility_id = 10
        mock_fac = MagicMock(spec=Facility)
        mock_fac.id = 10
        mock_fac.name = "Almacén La Yaguara"
        mock_fac.code = "ALM-YAG"
        mock_fac.address = "Calle 3, Galpón 4"
        mock_fac.company_id = 1

        def query_side_effect_fac(model):
            q = MagicMock()
            if model == PurchaseOrder:
                q.filter.return_value.first.return_value = mock_po
            elif model == Supplier:
                q.filter.return_value.first.return_value = mock_supp
            elif model == Currency:
                q.filter.return_value.first.return_value = mock_curr
            elif model == Facility:
                q.filter.return_value.first.return_value = mock_fac
            elif model == Company:
                q.filter.return_value.first.return_value = None
            else:
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side_effect_fac
        pdf_bytes_fac = generate_purchase_order_pdf(5001, db)
        reader_fac = pypdf.PdfReader(io.BytesIO(pdf_bytes_fac))
        text_fac = reader_fac.pages[0].extract_text()
        self.assertIn("DESPACHAR A / DESTINO: Almacén La Yaguara (ALM-YAG) - Calle 3, Galpón 4", text_fac)

        # Sub-test 3: Facility with name and code, no address
        mock_fac.address = None
        pdf_bytes_no_addr = generate_purchase_order_pdf(5001, db)
        reader_no_addr = pypdf.PdfReader(io.BytesIO(pdf_bytes_no_addr))
        text_no_addr = reader_no_addr.pages[0].extract_text()
        self.assertIn("DESPACHAR A / DESTINO: Almacén La Yaguara (ALM-YAG)", text_no_addr)

if __name__ == "__main__":
    unittest.main()
