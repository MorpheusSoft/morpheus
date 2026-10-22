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

