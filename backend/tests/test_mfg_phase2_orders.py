from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core import security
from app.api.deps import SessionLocal
from app.models.inventory import (
    InventorySnapshot,
    ProductVariant,
    StockMove,
    StockPicking,
    Batch,
    AdjustmentReason,
)
from app.models.manufacturing import ProductionOrder, BOMHeader
from app.services.shrinkage_profitability_service import get_shrinkage_reasons


@pytest.fixture(scope="module")
def auth_headers():
    token = security.create_access_token(1)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_mfg_phase2_explode_preview_and_seeded_orders(client: TestClient, auth_headers: dict):
    # 0. Verify catalog/variants and dashboard-summary endpoints
    res_cat = client.get("/api/v1/mfg/catalog/variants?limit=10", headers=auth_headers)
    assert res_cat.status_code == 200, res_cat.text
    assert isinstance(res_cat.json().get("items"), list)

    res_dash = client.get("/api/v1/mfg/dashboard-summary", headers=auth_headers)
    assert res_dash.status_code == 200, res_dash.text
    assert "kpis" in res_dash.json()

    # 1. Verify seeded orders exist (1 COMPLETED, 1 IN_PROGRESS)
    res_list = client.get("/api/v1/mfg/orders", headers=auth_headers)
    assert res_list.status_code == 200, res_list.text
    body = res_list.json()
    assert body["kpis"]["total_orders"] >= 2
    assert body["kpis"]["completed_count"] >= 1
    assert body["kpis"]["in_progress_count"] >= 1

    # 2. Verify explode-preview FEFO and discrete CEIL math on BOM-PAN-001
    db = SessionLocal()
    bom_pan = db.query(BOMHeader).filter(BOMHeader.code == "BOM-PAN-001").first()
    assert bom_pan is not None
    db.close()

    res_exp = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_pan.id,
            "planned_base_qty": 100.0,
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
        },
    )
    assert res_exp.status_code == 200, res_exp.text
    exp = res_exp.json()
    assert exp["stock_semaphore"] in ("AVAILABLE", "PARTIAL", "SHORTAGE")
    assert exp["expected_good_qty"] == 88.0
    assert exp["expected_natural_shrinkage_qty"] == 12.0
    assert len(exp["inputs"]) == 4

    # Verify discrete UoM CEIL on Yeast (850g * 0.002 = 1.7 -> CEIL = 2.0 UND)
    yeast_line = next(i for i in exp["inputs"] if i["component_variant_id"] == 122190)
    assert yeast_line["is_discrete_uom"] is True
    assert yeast_line["planned_base_qty"] == 2.0
    assert yeast_line["suggested_batch_id"] is not None
    assert yeast_line["suggested_batch_number"] is not None

    # Verify shortage detection on huge batch (e.g. 500,000 units)
    res_huge = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_pan.id,
            "planned_base_qty": 500000.0,
            "facility_id": 1,
        },
    )
    assert res_huge.status_code == 200
    assert res_huge.json()["stock_semaphore"] in ("PARTIAL", "SHORTAGE")


def test_mfg_phase2_atomic_kardex_settlement_and_no_double_counting(client: TestClient, auth_headers: dict):
    db = SessionLocal()
    try:
        # Verify MERMA_PROD_ANORMAL is excluded from Clara commercial shrinkage block reasons
        shrink_reason_ids = get_shrinkage_reasons(db)
        abnormal_reason = db.query(AdjustmentReason).filter_by(code="MERMA_PROD_ANORMAL").first()
        assert abnormal_reason is not None
        assert abnormal_reason.id not in shrink_reason_ids

        bom_pan = db.query(BOMHeader).filter(BOMHeader.code == "BOM-PAN-001").first()
        assert bom_pan is not None

        # Snapshot before creating and completing a test OP
        pt_snap_before = db.query(InventorySnapshot).filter_by(variant_id=bom_pan.primary_product_variant_id, facility_id=1).first()
        in_snap_before = db.query(InventorySnapshot).filter_by(variant_id=128236, facility_id=1).first()
        pt_qty_before = float(pt_snap_before.stock_qty)
        pt_batch_before = pt_snap_before.batch_id
        in_qty_before = float(in_snap_before.stock_qty)
    finally:
        db.close()

    # Create a new DRAFT/PLANNED order
    res_create = client.post(
        "/api/v1/mfg/orders",
        headers=auth_headers,
        json={
            "bom_id": bom_pan.id,
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "planned_base_qty": 50.0,
            "start_immediately": False,
            "notes": "OP de prueba automatizada Fase 2",
        },
    )
    assert res_create.status_code == 200, res_create.text
    created_op = res_create.json()
    op_id = created_op["id"]
    assert created_op["state"] == "PLANNED"

    # Start the order
    res_start = client.post(f"/api/v1/mfg/orders/{op_id}/start", headers=auth_headers)
    assert res_start.status_code == 200
    assert res_start.json()["state"] == "IN_PROGRESS"

    # Edge case: completing with actual_good_qty = 0 must fail with 400
    res_zero = client.post(
        f"/api/v1/mfg/orders/{op_id}/complete",
        headers=auth_headers,
        json={"actual_good_qty": 0.0, "explicit_damaged_qty": 2.0},
    )
    assert res_zero.status_code == 400

    # Complete the order with 43 good, 2 explicit damaged, 5 natural shrinkage, 18.0 kg flour
    custom_inputs = []
    for inp in created_op["inputs"]:
        q = 18.0 if inp["component_variant_id"] == 128236 else inp["planned_base_qty"]
        custom_inputs.append(
            {
                "input_id": inp["id"],
                "component_variant_id": inp["component_variant_id"],
                "batch_id": inp["batch_id"],
                "consumed_base_qty": q,
            }
        )

    res_comp = client.post(
        f"/api/v1/mfg/orders/{op_id}/complete",
        headers=auth_headers,
        json={
            "actual_labor_hours": 1.25,
            "actual_good_qty": 43.0,
            "explicit_damaged_qty": 2.0,
            "natural_shrinkage_qty": 5.0,
            "inputs": custom_inputs,
        },
    )
    assert res_comp.status_code == 200, res_comp.text
    comp_data = res_comp.json()
    assert comp_data["state"] == "COMPLETED"
    assert comp_data["kardex_links"]["picking_consumption_id"] is not None
    assert comp_data["kardex_links"]["picking_output_id"] is not None
    assert comp_data["kardex_links"]["waste_move_id"] is not None
    assert comp_data["cost_summary"]["explicit_waste_cost_usd"] > 0
    assert comp_data["outputs"][0]["generated_batch_number"] == f"L-{comp_data['order_number']}"

    # Edge cases: cannot complete again or cancel a COMPLETED order
    assert client.post(f"/api/v1/mfg/orders/{op_id}/complete", headers=auth_headers).status_code == 400
    assert client.post(f"/api/v1/mfg/orders/{op_id}/cancel", headers=auth_headers).status_code == 400

    # Verify exact single stock_qty delta in PostgreSQL (no double counting!) and cost updates
    db2 = SessionLocal()
    try:
        pt_snap_after = db2.query(InventorySnapshot).filter_by(variant_id=bom_pan.primary_product_variant_id, facility_id=1).first()
        in_snap_after = db2.query(InventorySnapshot).filter_by(variant_id=128236, facility_id=1).first()
        pt_var_after = db2.query(ProductVariant).filter_by(id=bom_pan.primary_product_variant_id).first()

        assert round(float(pt_snap_after.stock_qty) - pt_qty_before, 4) == 43.0
        assert round(float(in_snap_after.stock_qty) - in_qty_before, 4) == -18.0
        assert float(pt_snap_after.avg_cost) > 0
        assert float(pt_snap_after.current_cost) == comp_data["outputs"][0]["calculated_unit_cost_usd"]
        assert float(pt_var_after.last_cost) == comp_data["outputs"][0]["calculated_unit_cost_usd"]
        assert float(pt_var_after.replacement_cost) == comp_data["outputs"][0]["calculated_unit_cost_usd"]

        # Verify Neo Inventario Kardex report (/api/v1/reports/kardex) displays clean MFG flow descriptions
        res_kardex = client.post(
            "/api/v1/reports/kardex",
            headers=auth_headers,
            json={"product_ids": [bom_pan.primary_product_variant_id, 128236]},
        )
        assert res_kardex.status_code == 200, res_kardex.text
        kardex_results = res_kardex.json()
        pt_kardex = next(r for r in kardex_results if r["product_id"] == bom_pan.primary_product_variant_id)
        mfg_in_move = next(
            (m for m in pt_kardex["history"] if f"{comp_data['order_number']} [MFG_PRODUCE]" in (m["reference"] or "")),
            None,
        )
        assert mfg_in_move is not None
        assert mfg_in_move["flow_display"] == "Entrada de Producción (Producto Terminado)"

        in_kardex = next(r for r in kardex_results if r["product_id"] == 128236)
        mfg_out_move = next(
            (m for m in in_kardex["history"] if f"{comp_data['order_number']} [MFG_CONSUME]" in (m["reference"] or "")),
            None,
        )
        assert mfg_out_move is not None
        assert mfg_out_move["flow_display"] == "Consumo de Producción (Piso de Planta)"

        # Clean up the temporary test order & its moves so the DB keeps only the 2 clean sample orders
        order_obj = db2.query(ProductionOrder).filter_by(id=op_id).first()
        p_cons_id = order_obj.picking_consumption_id
        p_out_id = order_obj.picking_output_id
        gen_batch_id = order_obj.outputs[0].generated_batch_id if order_obj.outputs else None

        for inp_obj in order_obj.inputs:
            s_in = db2.query(InventorySnapshot).filter_by(variant_id=inp_obj.component_variant_id, facility_id=1).first()
            if s_in:
                s_in.stock_qty = s_in.stock_qty + inp_obj.consumed_base_qty
                db2.add(s_in)

        pt_snap_after.stock_qty = pt_snap_after.stock_qty - Decimal("43.0")
        pt_snap_after.batch_id = pt_batch_before
        db2.add(pt_snap_after)
        db2.delete(order_obj)
        db2.flush()

        if p_cons_id:
            db2.query(StockMove).filter_by(picking_id=p_cons_id).delete()
            db2.query(StockPicking).filter_by(id=p_cons_id).delete()
        if p_out_id:
            db2.query(StockMove).filter_by(picking_id=p_out_id).delete()
            db2.query(StockPicking).filter_by(id=p_out_id).delete()
        if gen_batch_id:
            db2.query(Batch).filter_by(id=gen_batch_id).delete()
        db2.commit()

        db2.refresh(pt_snap_after)
        db2.refresh(in_snap_after)
        assert round(float(pt_snap_after.stock_qty), 4) == round(pt_qty_before, 4)
        assert round(float(in_snap_after.stock_qty), 4) == round(in_qty_before, 4)
    finally:
        db2.close()


def test_mfg_phase2_adhoc_convergent_order_without_bom(client: TestClient, auth_headers: dict):
    """
    Tests N->1 Convergent Ad-Hoc Transformation Order (bom_id = None):
    1. Explode-preview without bom_id for a single output product (BOM-PAN-001 primary variant) and 1 raw material (128236).
    2. Create the Ad-Hoc order without bom_id.
    3. Add a dynamic second ingredient (122190 yeast) via POST /api/v1/mfg/orders/{id}/inputs.
    4. Complete the Ad-Hoc order and verify Kardex moves + cost absorption + DB restoration.
    """
    db = SessionLocal()
    try:
        bom_pan = db.query(BOMHeader).filter(BOMHeader.code == "BOM-PAN-001").first()
        assert bom_pan is not None
        pt_vid = bom_pan.primary_product_variant_id
        tracked_vids = [pt_vid, 128236, 122190]
        snaps_before = {}
        vars_before = {}
        for vid in tracked_vids:
            s = db.query(InventorySnapshot).filter_by(variant_id=vid, facility_id=1).first()
            v = db.query(ProductVariant).filter_by(id=vid).first()
            snaps_before[vid] = {
                "stock_qty": s.stock_qty,
                "avg_cost": s.avg_cost,
                "current_cost": s.current_cost,
                "batch_id": s.batch_id,
            }
            vars_before[vid] = {
                "last_cost": v.last_cost,
                "replacement_cost": v.replacement_cost,
            }
    finally:
        db.close()

    res_prev = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": None,
            "order_type": "FORMULA_CONVERGENT",
            "sector": "PANADERIA",
            "facility_id": 1,
            "planned_base_qty": 20.0,
            "standard_labor_hours": 0.5,
            "expected_shrinkage_pct": 5.0,
            "inputs": [
                {
                    "component_variant_id": 128236,
                    "planned_qty": 10.0,
                    "input_role": "RAW_MATERIAL",
                }
            ],
            "outputs": [
                {
                    "output_variant_id": pt_vid,
                    "planned_qty": 20.0,
                    "output_type": "FINISHED_GOOD",
                }
            ],
        },
    )
    assert res_prev.status_code == 200, res_prev.text
    assert res_prev.json()["bom_id"] is None
    assert res_prev.json()["bom_code"] == "TRANSF-LIBRE"

    res_create = client.post(
        "/api/v1/mfg/orders",
        headers=auth_headers,
        json={
            "bom_id": None,
            "order_type": "FORMULA_CONVERGENT",
            "sector": "PANADERIA",
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "planned_base_qty": 20.0,
            "standard_labor_hours": 0.5,
            "expected_shrinkage_pct": 5.0,
            "start_immediately": True,
            "notes": "OP Convergente Ad-Hoc Test",
            "inputs": [
                {
                    "component_variant_id": 128236,
                    "planned_qty": 10.0,
                    "input_role": "RAW_MATERIAL",
                }
            ],
            "outputs": [
                {
                    "output_variant_id": pt_vid,
                    "planned_qty": 20.0,
                    "output_type": "FINISHED_GOOD",
                }
            ],
        },
    )
    assert res_create.status_code == 200, res_create.text
    created_op = res_create.json()
    op_id = created_op["id"]

    try:
        assert created_op["bom_id"] is None
        assert created_op["bom_code"] == "TRANSF-LIBRE"

        # Add dynamic ingredient (122190)
        res_add = client.post(
            f"/api/v1/mfg/orders/{op_id}/inputs",
            headers=auth_headers,
            json={
                "component_variant_id": 122190,
                "planned_qty": 1.0,
                "input_role": "RAW_MATERIAL",
            },
        )
        assert res_add.status_code == 200, res_add.text
        assert len(res_add.json()["inputs"]) == 2

        # Complete order
        res_comp = client.post(
            f"/api/v1/mfg/orders/{op_id}/complete",
            headers=auth_headers,
            json={
                "actual_labor_hours": 0.5,
                "actual_good_qty": 19.0,
                "explicit_damaged_qty": 0.0,
                "natural_shrinkage_qty": 1.0,
            },
        )
        assert res_comp.status_code == 200, res_comp.text
        comp_data = res_comp.json()
        assert comp_data["state"] == "COMPLETED"
        assert comp_data["outputs"][0]["actual_good_qty"] == 19.0
        assert comp_data["outputs"][0]["calculated_unit_cost_usd"] > 0
    finally:
        db2 = SessionLocal()
        try:
            order_obj = db2.query(ProductionOrder).filter_by(id=op_id).first()
            if order_obj:
                p_cons_id = order_obj.picking_consumption_id
                p_out_id = order_obj.picking_output_id
                w_move_id = order_obj.waste_move_id
                gen_batch_ids = [o.generated_batch_id for o in order_obj.outputs if o.generated_batch_id]

                for vid in tracked_vids:
                    s = db2.query(InventorySnapshot).filter_by(variant_id=vid, facility_id=1).first()
                    v = db2.query(ProductVariant).filter_by(id=vid).first()
                    s.stock_qty = snaps_before[vid]["stock_qty"]
                    s.avg_cost = snaps_before[vid]["avg_cost"]
                    s.current_cost = snaps_before[vid]["current_cost"]
                    s.batch_id = snaps_before[vid]["batch_id"]
                    v.last_cost = vars_before[vid]["last_cost"]
                    v.replacement_cost = vars_before[vid]["replacement_cost"]
                    db2.add(s)
                    db2.add(v)
                db2.flush()

                db2.delete(order_obj)
                db2.flush()

                if w_move_id:
                    db2.query(StockMove).filter_by(id=w_move_id).delete()
                if p_cons_id:
                    db2.query(StockMove).filter_by(picking_id=p_cons_id).delete()
                    db2.query(StockPicking).filter_by(id=p_cons_id).delete()
                if p_out_id:
                    db2.query(StockMove).filter_by(picking_id=p_out_id).delete()
                    db2.query(StockPicking).filter_by(id=p_out_id).delete()
                db2.flush()
                for bid in gen_batch_ids:
                    if db2.query(StockMove).filter_by(batch_id=bid).count() == 0:
                        db2.query(Batch).filter_by(id=bid).delete()

                db2.commit()
        finally:
            db2.close()


def test_mfg_phase2_multi_facility_and_multi_work_center(client: TestClient, auth_headers: dict):
    """
    Tests Multi-Facility (1..N facilities), Multi-Work-Center (1..N stations per facility),
    and Dynamic Warehouses in Neo Producción:
    1. GET /api/v1/mfg/facilities-and-warehouses returns multiple facilities, warehouses per facility,
       and multiple WorkCenter stations per facility (including PANADERIA_HORNO_PISO in Facility 1
       and CUMBOTO_PANADERIA_1 in Facility 10).
    2. Explode-preview overriding work_center_id on BOM-PAN-001 (Facility 1) uses the secondary station's MOD/CIF rates.
    3. Explode-preview and order creation overriding facility_id=10 (Cumboto) resolves Cumboto's work center and warehouse,
       and GET /api/v1/mfg/orders?facility_id=10 filters orders and KPIs by facility.
    """
    res_fw = client.get("/api/v1/mfg/facilities-and-warehouses", headers=auth_headers)
    assert res_fw.status_code == 200, res_fw.text
    fw = res_fw.json()
    assert len(fw["facilities"]) >= 2
    assert len(fw["warehouses"]) >= 2
    assert len(fw["work_centers"]) >= 4

    # Verify Facility 1 has >= 2 BAKERY stations (PANADERIA_HORNO_1 and PANADERIA_HORNO_PISO)
    fac1_bakery_wcs = [
        w for w in fw["work_centers"]
        if w["facility_id"] == 1 and w["sector"] in ("BAKERY", "PANADERIA", "BAKERY_PASTRY")
    ]
    assert len(fac1_bakery_wcs) >= 2
    horno_piso = next((w for w in fac1_bakery_wcs if w["code"] == "PANADERIA_HORNO_PISO"), None)
    assert horno_piso is not None

    # Verify Facility 10 (Cumboto) has its warehouse and CUMBOTO_PANADERIA_1 station
    cumboto_whs = [w for w in fw["warehouses"] if w["facility_id"] == 10 and not w["is_scrap"]]
    assert len(cumboto_whs) >= 1
    cumboto_wc = next((w for w in fw["work_centers"] if w["code"] == "CUMBOTO_PANADERIA_1"), None)
    assert cumboto_wc is not None
    assert cumboto_wc["facility_id"] == 10

    db = SessionLocal()
    try:
        bom_pan = db.query(BOMHeader).filter(BOMHeader.code == "BOM-PAN-001").first()
        assert bom_pan is not None
        bom_pan_id = bom_pan.id
    finally:
        db.close()

    # 2. Explode-preview on Facility 1 overriding work_center_id to PANADERIA_HORNO_PISO ($5.00/hr MOD, $3.20/hr CIF)
    res_exp_wc2 = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_pan_id,
            "planned_base_qty": 100.0,
            "facility_id": 1,
            "work_center_id": horno_piso["id"],
        },
    )
    assert res_exp_wc2.status_code == 200, res_exp_wc2.text
    exp_wc2 = res_exp_wc2.json()
    assert exp_wc2["work_center_id"] == horno_piso["id"]
    assert exp_wc2["work_center_code"] == "PANADERIA_HORNO_PISO"
    assert exp_wc2["hourly_labor_rate"] == 5.0
    assert exp_wc2["hourly_overhead_rate"] == 3.2

    # 3. Explode-preview on Facility 10 (Cumboto) without specifying work_center_id -> auto-resolves CUMBOTO_PANADERIA_1
    res_exp_f10 = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_pan_id,
            "planned_base_qty": 50.0,
            "facility_id": 10,
        },
    )
    assert res_exp_f10.status_code == 200, res_exp_f10.text
    exp_f10 = res_exp_f10.json()
    assert exp_f10["facility_id"] == 10
    assert exp_f10["work_center_id"] == cumboto_wc["id"]
    assert exp_f10["source_warehouse_id"] == cumboto_whs[0]["id"]
    assert exp_f10["dest_warehouse_id"] == cumboto_whs[0]["id"]

    # 3b. Cross-facility work_center_id protection: passing facility_id=10 with a Facility 1 work_center_id must resolve Facility 10's station
    res_exp_cross = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_pan_id,
            "planned_base_qty": 50.0,
            "facility_id": 10,
            "work_center_id": horno_piso["id"],
        },
    )
    assert res_exp_cross.status_code == 200, res_exp_cross.text
    exp_cross = res_exp_cross.json()
    assert exp_cross["facility_id"] == 10
    assert exp_cross["work_center_id"] == cumboto_wc["id"]

    # 3c. Omitting facility_id while passing work_center_id from Facility 10 infers facility_id=10
    res_exp_infer = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_pan_id,
            "planned_base_qty": 50.0,
            "work_center_id": cumboto_wc["id"],
        },
    )
    assert res_exp_infer.status_code == 200, res_exp_infer.text
    exp_infer = res_exp_infer.json()
    assert exp_infer["facility_id"] == 10
    assert exp_infer["work_center_id"] == cumboto_wc["id"]

    # 3d. Verify GET /api/v1/mfg/catalog/variants?facility_id=10 returns facility-scoped stock_qty
    res_cat_f10 = client.get(
        "/api/v1/mfg/catalog/variants",
        params={"facility_id": 10, "ids": "128236", "limit": 10},
        headers=auth_headers,
    )
    assert res_cat_f10.status_code == 200, res_cat_f10.text
    cat_f10_items = res_cat_f10.json()["items"]
    assert len(cat_f10_items) == 1
    assert cat_f10_items[0]["id"] == 128236
    assert cat_f10_items[0]["facility_id"] == 10
    assert "stock_qty" in cat_f10_items[0]

    # Create PLANNED order in Facility 10 and verify facility_id filter on GET /api/v1/mfg/orders
    res_create_f10 = client.post(
        "/api/v1/mfg/orders",
        headers=auth_headers,
        json={
            "bom_id": bom_pan_id,
            "facility_id": 10,
            "work_center_id": horno_piso["id"],  # Also verify create_order auto-corrects cross-facility station
            "source_warehouse_id": cumboto_whs[0]["id"],
            "dest_warehouse_id": cumboto_whs[0]["id"],
            "planned_base_qty": 50.0,
            "start_immediately": False,
            "notes": "OP Prueba Multi-Sucursal Cumboto",
        },
    )
    assert res_create_f10.status_code == 200, res_create_f10.text
    op_f10 = res_create_f10.json()
    op_f10_id = op_f10["id"]
    try:
        assert op_f10["facility_id"] == 10
        assert op_f10["work_center_id"] == cumboto_wc["id"]

        res_list_f10 = client.get(
            "/api/v1/mfg/orders",
            params={"facility_id": 10},
            headers=auth_headers,
        )
        assert res_list_f10.status_code == 200
        list_f10 = res_list_f10.json()
        assert any(it["id"] == op_f10_id for it in list_f10["items"])
        assert all(it["facility_id"] == 10 for it in list_f10["items"])
        assert list_f10["kpis"]["total_orders"] >= 1
    finally:
        db2 = SessionLocal()
        try:
            order_obj = db2.query(ProductionOrder).filter_by(id=op_f10_id).first()
            if order_obj:
                db2.delete(order_obj)
                db2.commit()
        finally:
            db2.close()



