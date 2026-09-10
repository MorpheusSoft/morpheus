import sys
import os
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pytest
import io
from decimal import Decimal
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Company, Facility, SystemSettings
from app.models.inventory import PricingSession, PricingSessionLine, ProductVariant, ProductFacilityPrice, Product
from app.api.v1.endpoints.pricing_sessions import (
    calculate_proposed_price,
    attach_calculated_fields,
    parse_csv_structure,
    upload_csv_to_session,
    upload_pdf_to_session,
    associate_line_to_variant,
    LineAssociationPayload
)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_calculate_proposed_price_margins(db_session: Session):
    # Dummy variant
    variant = ProductVariant(
        sku="TEST-MARGIN-SKU",
        standard_cost=Decimal("10.00"),
        replacement_cost=Decimal("10.00"),
        sales_price=Decimal("20.00")
    )

    # 1. Target utility on sales: 30% margin on 1.28 cost -> 1.28 / (1 - 0.3) = 1.8286
    fp_30 = ProductFacilityPrice(target_utility_pct=Decimal("30.00"))
    price_sales = calculate_proposed_price(
        variant=variant,
        cost=1.28,
        db=db_session,
        facility_price=fp_30,
        utility_calc_method="MARGIN_ON_SALES"
    )
    assert price_sales == round(1.28 / 0.70, 4)
    assert price_sales == 1.8286

    # 2. Target utility on cost: 30% markup on 1.28 cost -> 1.28 * 1.30 = 1.664
    price_markup = calculate_proposed_price(
        variant=variant,
        cost=1.28,
        db=db_session,
        facility_price=fp_30,
        utility_calc_method="MARKUP_ON_COST"
    )
    assert price_markup == round(1.28 * 1.30, 4)
    assert price_markup == 1.664

    # 3. Target utility >= 100% (e.g. 143.28% on cost): 1.28 * (1 + 1.4328) = 3.114
    fp_markup_high = ProductFacilityPrice(target_utility_pct=Decimal("143.28"))
    price_high = calculate_proposed_price(
        variant=variant,
        cost=1.28,
        db=db_session,
        facility_price=fp_markup_high,
        utility_calc_method="MARGIN_ON_SALES"
    )
    assert price_high == round(1.28 * 2.4328, 4)
    assert price_high == 3.114

    # 4. No margin on ficha -> preserve historical margin
    # Variant has sales_price = 20.0, cost = 10.0 -> hist margin = 50%
    price_hist = calculate_proposed_price(
        variant=variant,
        cost=1.28,
        db=db_session,
        facility_price=None,
        utility_calc_method="MARGIN_ON_SALES"
    )
    # 1.28 / (1 - 0.50) = 2.56
    assert price_hist == round(1.28 / 0.50, 4)
    assert price_hist == 2.56

    # 5. Unmatched variant (None) -> 0.0
    price_unmatched = calculate_proposed_price(
        variant=None,
        cost=1.28,
        db=db_session
    )
    assert price_unmatched == 0.0

def test_parse_csv_structure():
    # Semicolon delimited with leading title rows
    csv_content = (
        "TITLE ROW 1;;;\n"
        "LINEA: METADATA;;;\n"
        "CODIGO;PRODUCTOS;UNIDADES X EMPAQUE;PRECIOS\n"
        ";;;UNIDAD\n"
        "123;BOLSAS TEST;36;1.28\n"
    )
    headers, data_rows, delim = parse_csv_structure(csv_content)
    assert delim == ';'
    assert headers[0] == 'CODIGO'
    assert headers[1] == 'PRODUCTOS'
    assert headers[2] == 'UNIDADES X EMPAQUE'
    assert headers[3] == 'PRECIOS UNIDAD'
    assert len(data_rows) == 1
    assert data_rows[0][0] == '123'
    assert data_rows[0][3] == '1.28'

    # Standard comma delimited
    csv_standard = (
        "sku,cost,description,barcode\n"
        "SKU001,10.50,Test Description,759100000001\n"
    )
    headers_s, data_rows_s, delim_s = parse_csv_structure(csv_standard)
    assert delim_s == ','
    assert headers_s == ['sku', 'cost', 'description', 'barcode']
    assert len(data_rows_s) == 1

def test_real_granco_files_import(db_session: Session):
    csv_path = "/home/lzambrano/Downloads/Listas de Precios  Granco.csv"
    xlsx_path = "/home/lzambrano/Downloads/Listas de Precios  Granco.xlsx"
    pdf_path = "/home/lzambrano/Downloads/Listas de Precios  Granco.pdf"

    if not (os.path.exists(csv_path) and os.path.exists(xlsx_path) and os.path.exists(pdf_path)):
        pytest.skip("Real sample files not found in /home/lzambrano/Downloads")

    # 1. Test CSV
    session_csv = PricingSession(
        name="Automated Test Granco CSV",
        source_type="CSV_UPLOAD",
        target_cost_type="REPLACEMENT",
        update_type="BOTH",
        status="DRAFT",
        created_by=1
    )
    db_session.add(session_csv)
    db_session.commit()
    db_session.refresh(session_csv)

    try:
        with open(csv_path, "rb") as f:
            upload_file = UploadFile(filename="Listas de Precios  Granco.csv", file=io.BytesIO(f.read()))
        res = upload_csv_to_session(db=db_session, id=session_csv.id, file=upload_file)
        assert res["lines_created"] >= 6

        # Find "BOLSAS 15LTS GRANCO 8UND" (variant 123440)
        line = db_session.query(PricingSessionLine).filter(
            PricingSessionLine.session_id == session_csv.id,
            PricingSessionLine.variant_id == 123440
        ).first()
        assert line is not None, "Variant 123440 should be matched in session lines"
        assert float(line.proposed_cost) == 1.28
        assert float(line.proposed_price) != 2.15, "Proposed price must NOT be the document's total 2.15"
        assert float(line.proposed_price) == 3.1140  # 1.28 * 2.4328 from ficha margin
    finally:
        db_session.query(PricingSessionLine).filter(PricingSessionLine.session_id == session_csv.id).delete()
        db_session.delete(session_csv)
        db_session.commit()

    # 2. Test XLSX
    session_xlsx = PricingSession(
        name="Automated Test Granco XLSX",
        source_type="PDF_UPLOAD",
        target_cost_type="REPLACEMENT",
        update_type="BOTH",
        status="DRAFT",
        created_by=1
    )
    db_session.add(session_xlsx)
    db_session.commit()
    db_session.refresh(session_xlsx)

    try:
        with open(xlsx_path, "rb") as f:
            upload_file = UploadFile(filename="Listas de Precios  Granco.xlsx", file=io.BytesIO(f.read()))
        res = upload_pdf_to_session(db=db_session, id=session_xlsx.id, file=upload_file)
        assert res["lines_created"] >= 6

        line = db_session.query(PricingSessionLine).filter(
            PricingSessionLine.session_id == session_xlsx.id,
            PricingSessionLine.variant_id == 123440
        ).first()
        assert line is not None
        assert float(line.proposed_cost) == 1.28
        assert float(line.proposed_price) != 2.15
        assert float(line.proposed_price) == 3.1140
    finally:
        db_session.query(PricingSessionLine).filter(PricingSessionLine.session_id == session_xlsx.id).delete()
        db_session.delete(session_xlsx)
        db_session.commit()

    # 3. Test PDF
    session_pdf = PricingSession(
        name="Automated Test Granco PDF",
        source_type="PDF_UPLOAD",
        target_cost_type="REPLACEMENT",
        update_type="BOTH",
        status="DRAFT",
        created_by=1
    )
    db_session.add(session_pdf)
    db_session.commit()
    db_session.refresh(session_pdf)

    try:
        with open(pdf_path, "rb") as f:
            upload_file = UploadFile(filename="Listas de Precios  Granco.pdf", file=io.BytesIO(f.read()))
        res = upload_pdf_to_session(db=db_session, id=session_pdf.id, file=upload_file)
        assert res["lines_created"] >= 6

        line = db_session.query(PricingSessionLine).filter(
            PricingSessionLine.session_id == session_pdf.id,
            PricingSessionLine.variant_id == 123440
        ).first()
        assert line is not None
        assert float(line.proposed_cost) == 1.28
        assert float(line.proposed_price) != 2.15
        assert float(line.proposed_price) == 3.1140
    finally:
        db_session.query(PricingSessionLine).filter(PricingSessionLine.session_id == session_pdf.id).delete()
        db_session.delete(session_pdf)
        db_session.commit()

def test_associate_line_recalculates_price(db_session: Session):
    session = PricingSession(
        name="Test Session Associate",
        source_type="CSV_UPLOAD",
        target_cost_type="REPLACEMENT",
        update_type="BOTH",
        status="DRAFT",
        created_by=1
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    # Unmatched line with proposed_price = 0.0
    line = PricingSessionLine(
        session_id=session.id,
        variant_id=None,
        external_reference_name="Unmatched Granco Bag",
        old_cost=0.0,
        proposed_cost=1.28,
        old_replacement_cost=0.0,
        proposed_replacement_cost=1.28,
        old_price=0.0,
        proposed_price=0.0,
        action="CREATE_NEW"
    )
    db_session.add(line)
    db_session.commit()
    db_session.refresh(line)

    try:
        # Associate to variant 123440 (BOLSAS 15LTS)
        payload = LineAssociationPayload(variant_id=123440)
        res = associate_line_to_variant(
            db=db_session,
            session_id=session.id,
            line_id=line.id,
            payload=payload
        )
        assert "correctamente" in res["message"]
        db_session.refresh(line)
        assert line.variant_id == 123440
        assert float(line.proposed_cost) == 1.28
        assert float(line.proposed_price) == 3.1140  # Automatically calculated from variant ficha margin
    finally:
        db_session.query(PricingSessionLine).filter(PricingSessionLine.session_id == session.id).delete()
        db_session.delete(session)
        db_session.commit()

def test_attach_calculated_fields_alignment(db_session: Session):
    """
    Verifies that attach_calculated_fields correctly computes suggested_price
    using the same formula as calculate_proposed_price, rather than defaulting
    to suggested_price = cost when target_utility >= 100%.
    """
    session = PricingSession(
        name="Test Attach Alignment",
        source_type="CSV_UPLOAD",
        target_cost_type="REPLACEMENT",
        update_type="BOTH",
        status="DRAFT",
        created_by=1
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    # Line for variant 123440 (BOLSAS 15LTS, margin = 143.28%)
    line = PricingSessionLine(
        session_id=session.id,
        variant_id=123440,
        proposed_cost=Decimal("1.2800"),
        proposed_replacement_cost=Decimal("1.2800"),
        old_cost=Decimal("0.6700"),
        old_replacement_cost=Decimal("0.6700"),
        old_price=Decimal("1.6300"),
        proposed_price=Decimal("3.1140"),
        action="UPDATE_COST"
    )
    db_session.add(line)
    db_session.commit()
    db_session.refresh(session)

    try:
        attach_calculated_fields(session, db_session)
        # suggested_price must match proposed_price (3.1140), NOT fall back to 1.2800
        assert float(line.suggested_price) == 3.1140
        assert float(line.suggested_margin) == 143.28
    finally:
        db_session.delete(session)
        db_session.commit()

def test_parse_csv_structure_edge_cases():
    # 1. zip_longest edge case: next_row has fewer columns than header
    csv_fewer = (
        "COL1;COL2;COL3;COL4\n"
        ";;UNIDAD\n"
        "VAL1;VAL2;VAL3;VAL4\n"
    )
    headers_fewer, rows_fewer, delim = parse_csv_structure(csv_fewer)
    assert len(headers_fewer) == 4
    assert headers_fewer[0] == "COL1"
    assert headers_fewer[1] == "COL2"
    assert headers_fewer[2] == "COL3 UNIDAD"
    assert headers_fewer[3] == "COL4"  # COL4 must not be dropped!

    # 2. UTF-8 BOM sniffing
    csv_bom = "\ufeffCODIGO;PRODUCTOS;COSTO\n1001;TEST;5.00\n"
    headers_bom, rows_bom, delim_bom = parse_csv_structure(csv_bom)
    assert delim_bom == ';'
    assert 'CODIGO' in headers_bom[0]
    assert len(rows_bom) == 1

def test_calculate_proposed_price_multi_facility(db_session: Session):
    # Dummy variant with no facility passed, fallback to historical when old cost was 0
    variant_zero_cost = ProductVariant(
        sku="TEST-ZERO-COST",
        standard_cost=Decimal("0.00"),
        replacement_cost=Decimal("0.00"),
        sales_price=Decimal("15.00")
    )
    # If cost is 10 and old sales price is 15, should return max(15, 10) = 15
    price_1 = calculate_proposed_price(variant=variant_zero_cost, cost=10.0, db=db_session)
    assert price_1 == 15.0

    # If cost is 25 (exceeding old sales price 15), should return max(15, 25) = 25
    price_2 = calculate_proposed_price(variant=variant_zero_cost, cost=25.0, db=db_session)
    assert price_2 == 25.0

def test_csv_deduplication(db_session: Session):
    session = PricingSession(
        name="Test Deduplication",
        source_type="CSV_UPLOAD",
        target_cost_type="REPLACEMENT",
        update_type="BOTH",
        status="DRAFT",
        created_by=1
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    # CSV with 2 rows pointing to the same variant (barcode 7591221928202 -> variant 123440)
    csv_content = (
        "CODIGO DE BARRAS UNIDAD;CODIGO;PRODUCTOS;PRECIOS UNIDAD\n"
        "7591221928202;1392820;BOLSAS P/BASURA 15 L;1.20\n"
        "7591221928202;1392820;BOLSAS P/BASURA 15 L;1.28\n"
    )
    try:
        upload_file = UploadFile(filename="dedup.csv", file=io.BytesIO(csv_content.encode('utf-8')))
        res = upload_csv_to_session(db=db_session, id=session.id, file=upload_file)

        # Only 1 line created for variant 123440, with the latest cost 1.28
        lines = db_session.query(PricingSessionLine).filter(
            PricingSessionLine.session_id == session.id,
            PricingSessionLine.variant_id == 123440
        ).all()
        assert len(lines) == 1
        assert float(lines[0].proposed_cost) == 1.28
        assert float(lines[0].proposed_price) == 3.1140
    finally:
        db_session.delete(session)
        db_session.commit()

