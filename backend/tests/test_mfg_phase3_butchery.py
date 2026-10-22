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


@pytest.fixture(scope="module")
def auth_headers():
    token = security.create_access_token(1)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_mfg_phase3_seeded_butchery_orders_and_explode_preview(client: TestClient, auth_headers: dict):
    # 1. Verify seeded MEAT_DISASSEMBLY orders exist (1 COMPLETED, 1 IN_PROGRESS)
    res_list = client.get(
        "/api/v1/mfg/orders",
        params={"order_type": "MEAT_DISASSEMBLY"},
        headers=auth_headers,
    )
    assert res_list.status_code == 200, res_list.text
    body = res_list.json()
    assert body["kpis"]["total_orders"] >= 2
    assert body["kpis"]["completed_count"] >= 1
    assert body["kpis"]["in_progress_count"] >= 1
    assert "butchery_kpis" in body
    assert body["butchery_kpis"]["completed_carcasses_count"] >= 1
    assert body["butchery_kpis"]["total_carcass_weight_processed_kg"] >= 100.0

    # 2. Verify explode-preview on DES-RES-001 returns expected outputs with NIC 2 joint cost allocation
    db = SessionLocal()
    try:
        bom_des = db.query(BOMHeader).filter(BOMHeader.code == "DES-RES-001").first()
        assert bom_des is not None
        bom_des_id = bom_des.id
    finally:
        db.close()

    res_exp = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": bom_des_id,
            "planned_base_qty": 110.0,
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
        },
    )
    assert res_exp.status_code == 200, res_exp.text
    exp = res_exp.json()
    assert exp["bom_type"] == "DIVERGENT_DISASSEMBLY"
    assert exp["scale_factor"] == 1.1
    assert exp["expected_natural_shrinkage_qty"] == 3.3
    assert exp["expected_good_qty"] == 96.8
    assert exp["expected_byproduct_qty"] == 9.9
    assert len(exp["outputs"]) == 6

    lomito_out = next(o for o in exp["outputs"] if o["output_variant_id"] == 126014)
    costilla_out = next(o for o in exp["outputs"] if o["output_variant_id"] == 122003)
    byprod_out = next(o for o in exp["outputs"] if o["output_type"] == "BY_PRODUCT")

    assert lomito_out["planned_qty"] == 4.4
    assert byprod_out["planned_qty"] == 9.9
    # Market Value Index must assign higher unit cost to Lomito ($14 PVP) than Costilla ($5.50 PVP)
    assert lomito_out["calculated_unit_cost_usd"] > costilla_out["calculated_unit_cost_usd"]
    assert byprod_out["calculated_unit_cost_usd"] == 1.0


def test_mfg_phase3_simulate_butchery_settlement_mass_balance_and_nic2(client: TestClient, auth_headers: dict):
    db = SessionLocal()
    try:
        bom_des = db.query(BOMHeader).filter(BOMHeader.code == "DES-RES-001").first()
        assert bom_des is not None
        bom_des_id = bom_des.id
    finally:
        db.close()

    base_outputs = [
        {"output_variant_id": 126014, "actual_good_qty": 4.2, "explicit_damaged_qty": 0.0, "market_reference_price": 14.0},
        {"output_variant_id": 122000, "actual_good_qty": 27.5, "explicit_damaged_qty": 0.5, "market_reference_price": 10.0},
        {"output_variant_id": 123630, "actual_good_qty": 32.0, "explicit_damaged_qty": 0.0, "market_reference_price": 8.0},
        {"output_variant_id": 122003, "actual_good_qty": 13.8, "explicit_damaged_qty": 0.0, "market_reference_price": 5.5},
        {"output_variant_id": 122002, "actual_good_qty": 10.0, "explicit_damaged_qty": 0.0, "market_reference_price": 5.3},
        {"output_variant_id": 121996, "actual_good_qty": 9.0, "explicit_damaged_qty": 0.0, "market_reference_price": 1.0},
    ]
    # Sum of good (87.5 main + 9.0 byproduct = 96.5) + explicit damaged (0.5) = 97.0 kg

    # Case A: Unbalanced mass (natural_shrinkage_qty = 0.0 -> 3.0 kg unaccounted)
    res_unbal = client.post(
        "/api/v1/mfg/butchery/simulate-settlement",
        headers=auth_headers,
        json={
            "bom_id": bom_des_id,
            "actual_input_weight_kg": 100.0,
            "actual_labor_hours": 2.5,
            "natural_shrinkage_qty": 0.0,
            "outputs": base_outputs,
        },
    )
    assert res_unbal.status_code == 200, res_unbal.text
    unbal = res_unbal.json()
    assert unbal["mass_balance"]["is_mass_balanced"] is False
    assert unbal["mass_balance"]["unaccounted_weight_kg"] == 3.0
    assert unbal["mass_balance"]["suggested_natural_shrinkage_qty"] == 3.0

    # Case B: Balanced mass (natural_shrinkage_qty = 3.0 -> unaccounted_weight_kg = 0.0)
    res_bal = client.post(
        "/api/v1/mfg/butchery/simulate-settlement",
        headers=auth_headers,
        json={
            "bom_id": bom_des_id,
            "actual_input_weight_kg": 100.0,
            "actual_labor_hours": 2.5,
            "natural_shrinkage_qty": 3.0,
            "outputs": base_outputs,
        },
    )
    assert res_bal.status_code == 200, res_bal.text
    bal = res_bal.json()
    mb = bal["mass_balance"]
    cs = bal["cost_waterfall"]

    assert mb["is_mass_balanced"] is True
    assert mb["unaccounted_weight_kg"] == 0.0
    assert mb["accounted_pct"] == 100.0
    assert mb["main_cuts_good_weight_kg"] == 87.5
    assert mb["byproduct_good_weight_kg"] == 9.0
    assert mb["explicit_waste_weight_kg"] == 0.5
    assert mb["natural_shrinkage_weight_kg"] == 3.0

    # Verify NIC 2 Cost Waterfall and zero reconciliation delta
    assert cs["byproduct_credit_usd"] == 9.0
    assert cs["explicit_waste_cost_usd"] > 0
    assert cs["reconciliation_delta_usd"] == 0.0
    assert round(cs["total_allocated_main_cuts_usd"] - cs["net_cost_pool_for_main_cuts_usd"], 4) == 0.0

    # Verify Market Value Index cost hierarchy: Lomito > Solomo > Pulpa > Costilla > Carne Molida
    out_map = {o["output_variant_id"]: o for o in bal["outputs"]}
    assert out_map[126014]["calculated_unit_cost_usd"] > out_map[122000]["calculated_unit_cost_usd"]
    assert out_map[122000]["calculated_unit_cost_usd"] > out_map[123630]["calculated_unit_cost_usd"]
    assert out_map[123630]["calculated_unit_cost_usd"] > out_map[122003]["calculated_unit_cost_usd"]
    assert out_map[122003]["calculated_unit_cost_usd"] > out_map[122002]["calculated_unit_cost_usd"]
    # Sum of cost_allocation_pct across main cuts must be ~100%
    total_alpha_pct = sum(
        o["cost_allocation_pct"] for o in bal["outputs"] if o["output_type"] != "BY_PRODUCT"
    )
    assert round(total_alpha_pct, 2) == 100.0


def test_mfg_phase3_atomic_butchery_completion_kardex_and_wavg(client: TestClient, auth_headers: dict):
    db = SessionLocal()
    try:
        bom_des = db.query(BOMHeader).filter(BOMHeader.code == "DES-RES-001").first()
        assert bom_des is not None
        bom_des_id = bom_des.id

        # Record snapshots & variants before test order creation
        tracked_variant_ids = [122109, 121988, 126014, 122000, 123630, 122003, 122002, 121996]
        snaps_before = {}
        vars_before = {}
        for vid in tracked_variant_ids:
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

    # 1. Create a new MEAT_DISASSEMBLY order for 100 kg carcass
    res_create = client.post(
        "/api/v1/mfg/orders",
        headers=auth_headers,
        json={
            "bom_id": bom_des_id,
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "planned_base_qty": 100.0,
            "start_immediately": True,
            "notes": "OP Desposte Prueba Fase 3",
        },
    )
    assert res_create.status_code == 200, res_create.text
    created_op = res_create.json()
    op_id = created_op["id"]
    assert created_op["order_type"] == "MEAT_DISASSEMBLY"
    assert created_op["state"] == "IN_PROGRESS"

    # 2. Edge case: Attempting to complete with unbalanced mass (e.g. 15 kg natural shrinkage -> 112 kg != 100 kg) must fail with 400
    unbalanced_outputs = [
        {"output_id": o["id"], "output_variant_id": o["output_variant_id"], "actual_good_qty": o["planned_qty"], "explicit_damaged_qty": 0.0, "market_reference_price": o["market_reference_price_usd"]}
        for o in created_op["outputs"]
    ]
    res_fail = client.post(
        f"/api/v1/mfg/orders/{op_id}/complete",
        headers=auth_headers,
        json={
            "actual_labor_hours": 2.5,
            "natural_shrinkage_qty": 15.0,  # 97 + 15 = 112 kg != 100 kg
            "outputs": unbalanced_outputs,
        },
    )
    assert res_fail.status_code == 400
    assert "Balance de Masa" in res_fail.json()["detail"]

    # 3. Complete with 100% Mass Balance:
    # 87.5 kg good main cuts + 9.0 kg byproduct + 0.5 kg damaged Solomo + 3.0 kg natural shrinkage = 100.0 kg
    custom_outputs = []
    for o in created_op["outputs"]:
        vid = o["output_variant_id"]
        if vid == 126014:
            good_q, dmg_q = 4.2, 0.0
        elif vid == 122000:
            good_q, dmg_q = 27.5, 0.5
        elif vid == 123630:
            good_q, dmg_q = 32.0, 0.0
        elif vid == 122003:
            good_q, dmg_q = 13.8, 0.0
        elif vid == 122002:
            good_q, dmg_q = 10.0, 0.0
        else:  # 121996 Huesito Ahumado
            good_q, dmg_q = 9.0, 0.0
        custom_outputs.append(
            {
                "output_id": o["id"],
                "output_variant_id": o["output_variant_id"],
                "actual_good_qty": good_q,
                "explicit_damaged_qty": dmg_q,
                "market_reference_price": o["market_reference_price_usd"],
            }
        )

    res_comp = client.post(
        f"/api/v1/mfg/orders/{op_id}/complete",
        headers=auth_headers,
        json={
            "actual_labor_hours": 2.5,
            "natural_shrinkage_qty": 3.0,
            "outputs": custom_outputs,
        },
    )
    assert res_comp.status_code == 200, res_comp.text
    comp = res_comp.json()
    assert comp["state"] == "COMPLETED"
    assert comp["kardex_links"]["picking_consumption_id"] is not None
    assert comp["kardex_links"]["picking_output_id"] is not None
    assert comp["kardex_links"]["waste_move_id"] is not None
    assert comp["cost_summary"]["byproduct_credit_usd"] == 9.0
    assert comp["cost_summary"]["explicit_waste_cost_usd"] > 0

    # Verify each output has its individual sanitary batch L-{order_number}-{sku}
    for out_line in comp["outputs"]:
        expected_batch = f"L-{comp['order_number']}-{out_line['output_sku']}"
        assert out_line["generated_batch_number"] == expected_batch
        assert out_line["stock_move_id"] is not None

    # 4. Verify exact single stock_qty delta in PostgreSQL (no double counting!) and differential WAVG updates
    db2 = SessionLocal()
    try:
        # Carcass 122109 decreased by 100.0 kg
        s_carcass = db2.query(InventorySnapshot).filter_by(variant_id=122109, facility_id=1).first()
        assert round(float(s_carcass.stock_qty) - float(snaps_before[122109]["stock_qty"]), 4) == -100.0

        # Trays 121988 decreased by 2.0 UND (planned_base_qty in DES-RES-001)
        s_tray = db2.query(InventorySnapshot).filter_by(variant_id=121988, facility_id=1).first()
        assert round(float(s_tray.stock_qty) - float(snaps_before[121988]["stock_qty"]), 4) == -2.0

        # Verify each cut's stock_qty increased by exact actual_good_qty and costs updated
        expected_good_by_vid = {
            126014: 4.2,
            122000: 27.5,
            123630: 32.0,
            122003: 13.8,
            122002: 10.0,
            121996: 9.0,
        }
        for out_line in comp["outputs"]:
            vid = out_line["output_variant_id"]
            s_after = db2.query(InventorySnapshot).filter_by(variant_id=vid, facility_id=1).first()
            v_after = db2.query(ProductVariant).filter_by(id=vid).first()
            assert round(float(s_after.stock_qty) - float(snaps_before[vid]["stock_qty"]), 4) == expected_good_by_vid[vid]
            assert float(s_after.current_cost) == out_line["calculated_unit_cost_usd"]
            assert float(v_after.last_cost) == out_line["calculated_unit_cost_usd"]
            assert float(v_after.replacement_cost) == out_line["calculated_unit_cost_usd"]

        # Verify waste move uses MERMA_PROD_ANORMAL
        waste_move = db2.query(StockMove).filter_by(id=comp["kardex_links"]["waste_move_id"]).first()
        assert waste_move is not None
        abnormal_reason = db2.query(AdjustmentReason).filter_by(code="MERMA_PROD_ANORMAL").first()
        assert waste_move.adjustment_reason_id == abnormal_reason.id
    finally:
        # 5. Clean up temporary test order and restore exact DB state
        order_obj = db2.query(ProductionOrder).filter_by(id=op_id).first()
        if order_obj:
            p_cons_id = order_obj.picking_consumption_id
            p_out_id = order_obj.picking_output_id
            w_move_id = order_obj.waste_move_id
            gen_batch_ids = [o.generated_batch_id for o in order_obj.outputs if o.generated_batch_id]

            for vid in tracked_variant_ids:
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
        db2.close()


def test_mfg_phase3_edge_cases_zero_qty_cut_and_overridden_carcass_weight(client: TestClient, auth_headers: dict):
    """
    Probes edge cases:
    1. Overriding actual_input_weight_kg (118.5 Kg vs 120.0 Kg planned) while also passing req.inputs with original 120.0 Kg.
    2. Having a main co-product cut with actual_good_qty = 0.0 (Lomito 126014 = 0.0 Kg) -> no Batch or StockMove created for it,
       and 100% of net_joint_cost_to_distribute_usd is absorbed by active cuts (Delta = $0.0000).
    3. Passing cost_allocation_method='FIXED_NRV' on an output in CompleteOrderOutputLine and verifying 100% parity
       between simulate-settlement and complete.
    4. Simulating an already-COMPLETED order does not double-blend projected_wavg_cost_usd.
    """
    db = SessionLocal()
    try:
        bom_des = db.query(BOMHeader).filter(BOMHeader.code == "DES-RES-001").first()
        assert bom_des is not None
        bom_des_id = bom_des.id

        tracked_variant_ids = [122109, 121988, 126014, 122000, 123630, 122003, 122002, 121996]
        snaps_before = {}
        vars_before = {}
        for vid in tracked_variant_ids:
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

    res_create = client.post(
        "/api/v1/mfg/orders",
        headers=auth_headers,
        json={
            "bom_id": bom_des_id,
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "planned_base_qty": 120.0,
            "start_immediately": True,
            "notes": "OP Edge Case 118.5 Kg y Lomito 0 Kg",
        },
    )
    assert res_create.status_code == 200, res_create.text
    created_op = res_create.json()
    op_id = created_op["id"]

    # Build inputs array keeping original 120.0 Kg on the carcass while passing actual_input_weight_kg=118.5
    inputs_payload = [
        {
            "input_id": inp["id"],
            "component_variant_id": inp["component_variant_id"],
            "batch_id": inp["batch_id"],
            "consumed_base_qty": inp["planned_base_qty"],
        }
        for inp in created_op["inputs"]
    ]

    # Total mass = 0.0 (Lomito) + 36.0 (Solomo) + 38.0 (Pulpa) + 18.0 (Costilla) + 12.0 (Molida as FIXED_NRV) + 11.0 (Hueso) + 3.5 (Oreo) = 118.5 Kg
    outputs_payload = []
    for o in created_op["outputs"]:
        vid = o["output_variant_id"]
        if vid == 126014:  # Lomito -> 0.0 Kg!
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": 0.0,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": 14.0,
            })
        elif vid == 122000:  # Solomo
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": 36.0,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": 10.0,
            })
        elif vid == 123630:  # Pulpa
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": 38.0,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": 8.0,
            })
        elif vid == 122003:  # Costilla
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": 18.0,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": 5.5,
            })
        elif vid == 122002:  # Molida overridden with cost_allocation_method="FIXED_NRV"
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": 12.0,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": 5.0,
                "cost_allocation_method": "FIXED_NRV",
            })
        else:  # 121996 Hueso
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": 11.0,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": 1.0,
            })

    sim_res = client.post(
        "/api/v1/mfg/butchery/simulate-settlement",
        headers=auth_headers,
        json={
            "order_id": op_id,
            "actual_input_weight_kg": 118.5,
            "actual_labor_hours": 3.0,
            "natural_shrinkage_qty": 3.5,
            "inputs": inputs_payload,
            "outputs": outputs_payload,
        },
    )
    assert sim_res.status_code == 200, sim_res.text
    sim_data = sim_res.json()
    assert sim_data["mass_balance"]["is_mass_balanced"] is True
    assert sim_data["mass_balance"]["input_weight_kg"] == 118.5
    # Byproduct credit = 11.0 * $1.0 + 12.0 * $5.0 (FIXED_NRV override) = $71.0
    assert sim_data["cost_summary"]["byproduct_credit_usd"] == 71.0
    assert sim_data["cost_summary"]["reconciliation_delta_usd"] == 0.0

    comp_res = client.post(
        f"/api/v1/mfg/orders/{op_id}/complete",
        headers=auth_headers,
        json={
            "actual_input_weight_kg": 118.5,
            "actual_labor_hours": 3.0,
            "natural_shrinkage_qty": 3.5,
            "inputs": inputs_payload,
            "outputs": outputs_payload,
        },
    )
    assert comp_res.status_code == 200, comp_res.text
    comp_data = comp_res.json()

    try:
        # 1. Verify exact parity between simulate-settlement and complete_order
        assert comp_data["actual_input_weight_kg"] == 118.5
        assert comp_data["cost_summary"]["direct_materials_usd"] == sim_data["cost_summary"]["direct_materials_usd"]
        assert comp_data["cost_summary"]["byproduct_credit_usd"] == 71.0
        assert comp_data["cost_summary"]["net_production_cost_usd"] == sim_data["cost_summary"]["net_joint_cost_to_distribute_usd"]

        comp_out_map = {o["output_variant_id"]: o for o in comp_data["outputs"]}
        sim_out_map = {o["output_variant_id"]: o for o in sim_data["outputs"]}

        # 2. Verify zero-qty cut (Lomito 126014) has no batch and no stock_move_id
        lomito_comp = comp_out_map[126014]
        assert lomito_comp["actual_good_qty"] == 0.0
        assert lomito_comp["generated_batch_id"] is None
        assert lomito_comp["generated_batch_number"] is None
        assert lomito_comp["stock_move_id"] is None
        assert lomito_comp["allocated_total_cost_usd"] == 0.0

        # 3. Verify remaining active main cuts absorbed 100% of net_production_cost_usd
        active_main_ids = [122000, 123630, 122003]
        assert round(sum(comp_out_map[vid]["allocated_total_cost_usd"] for vid in active_main_ids), 4) == comp_data["cost_summary"]["net_production_cost_usd"]
        assert round(sum(comp_out_map[vid]["cost_allocation_pct"] for vid in active_main_ids), 4) == 100.0
        for vid in active_main_ids:
            assert comp_out_map[vid]["calculated_unit_cost_usd"] == sim_out_map[vid]["calculated_unit_cost_usd"]

        # 4. Verify simulating an already-COMPLETED order does not double-blend WAVG
        sim_after = client.post(
            "/api/v1/mfg/butchery/simulate-settlement",
            headers=auth_headers,
            json={"order_id": op_id},
        )
        assert sim_after.status_code == 200
        sim_after_map = {o["output_variant_id"]: o for o in sim_after.json()["outputs"]}
        for vid in active_main_ids:
            assert sim_after_map[vid]["projected_wavg_cost_usd"] == comp_out_map[vid]["current_inventory_wavg_usd"]
    finally:
        db2 = SessionLocal()
        try:
            order_obj = db2.query(ProductionOrder).filter_by(id=op_id).first()
            if order_obj:
                p_cons_id = order_obj.picking_consumption_id
                p_out_id = order_obj.picking_output_id
                w_move_id = order_obj.waste_move_id
                gen_batch_ids = [o.generated_batch_id for o in order_obj.outputs if o.generated_batch_id]

                for vid in tracked_variant_ids:
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


def test_mfg_adhoc_orders_convergent_and_divergent_without_bom(client: TestClient, auth_headers: dict):
    """
    Tests end-to-end Ad-Hoc Material Transformation (bom_id = None):
    1. Ad-Hoc explode-preview without bom_id.
    2. Creating an Ad-Hoc MEAT_DISASSEMBLY order (bom_id = None) with 1 primary input (122109) and 2 cuts (122000, 123630).
    3. Verifying GET /api/v1/mfg/orders includes the Ad-Hoc order with bom_code='TRANSF-LIBRE' (OUTER JOIN).
    4. Adding a dynamic input (121988 packaging tray) via POST /api/v1/mfg/orders/{id}/inputs and a dynamic output (121996 bone byproduct) via POST /api/v1/mfg/orders/{id}/outputs.
    5. Simulating and completing the Ad-Hoc order and verifying NIC 2 cost distribution + Kardex moves + mfg.v_fact_production_costing view.
    6. Saving the Ad-Hoc order as a reusable BOM template via POST /api/v1/mfg/orders/{id}/save-as-bom.
    """
    from sqlalchemy import text

    db = SessionLocal()
    try:
        tracked_variant_ids = [122109, 121988, 122000, 123630, 121996]
        snaps_before = {}
        vars_before = {}
        for vid in tracked_variant_ids:
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

    # 1. Ad-Hoc explode-preview without bom_id
    res_prev = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": None,
            "facility_id": 1,
            "order_type": "MEAT_DISASSEMBLY",
            "sector": "CARNICERIA",
            "planned_base_qty": 50.0,
            "standard_labor_hours": 1.0,
            "inputs": [
                {
                    "component_variant_id": 122109,
                    "planned_qty": 50.0,
                    "scrap_factor_pct": 0.0,
                    "input_role": "PRIMARY_MATRIX",
                }
            ],
            "outputs": [
                {
                    "output_variant_id": 122000,
                    "planned_qty": 25.0,
                    "output_type": "MAIN_CUT",
                    "cost_allocation_method": "SALES_VALUE_NRV",
                    "market_reference_price": 10.0,
                },
                {
                    "output_variant_id": 123630,
                    "planned_qty": 20.0,
                    "output_type": "MAIN_CUT",
                    "cost_allocation_method": "SALES_VALUE_NRV",
                    "market_reference_price": 8.0,
                },
            ],
        },
    )
    assert res_prev.status_code == 200, res_prev.text
    prev_data = res_prev.json()
    assert prev_data["bom_id"] is None
    assert prev_data["bom_code"] == "TRANSF-LIBRE"
    assert len(prev_data["inputs"]) == 1
    assert len(prev_data["outputs"]) == 2
    assert "net_joint_cost_to_distribute_usd" in prev_data["cost_projection"]
    for out_item in prev_data["outputs"]:
        assert "gross_margin_pct" in out_item
        assert "commercial_value_usd" in out_item
        assert "projected_wavg_cost_usd" in out_item

    # 1b. Verify explode-preview when all outputs are marked BY_PRODUCT does not double-count mass
    res_prev_all_byp = client.post(
        "/api/v1/mfg/orders/explode-preview",
        headers=auth_headers,
        json={
            "bom_id": None,
            "order_type": "MEAT_DISASSEMBLY",
            "sector": "CARNICERIA",
            "facility_id": 1,
            "source_warehouse_id": 1,
            "planned_base_qty": 50.0,
            "inputs": [
                {
                    "component_variant_id": 122109,
                    "planned_qty": 50.0,
                    "scrap_factor_pct": 0.0,
                    "input_role": "PRIMARY_MATRIX",
                }
            ],
            "outputs": [
                {
                    "output_variant_id": 121996,
                    "planned_qty": 30.0,
                    "output_type": "BYPRODUCT",
                    "cost_allocation_method": "FIXED_NRV",
                    "market_reference_price": 1.0,
                },
                {
                    "output_variant_id": 123630,
                    "planned_qty": 15.0,
                    "output_type": "BYPRODUCT",
                    "cost_allocation_method": "FIXED_NRV",
                    "market_reference_price": 2.0,
                },
            ],
        },
    )
    assert res_prev_all_byp.status_code == 200, res_prev_all_byp.text
    all_byp_data = res_prev_all_byp.json()
    assert all_byp_data["expected_good_qty"] == 30.0
    assert all_byp_data["expected_byproduct_qty"] == 15.0

    # 2. Create Ad-Hoc order without bom_id
    res_create = client.post(
        "/api/v1/mfg/orders",
        headers=auth_headers,
        json={
            "bom_id": None,
            "order_type": "MEAT_DISASSEMBLY",
            "sector": "CARNICERIA",
            "facility_id": 1,
            "source_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "planned_base_qty": 50.0,
            "standard_labor_hours": 1.0,
            "expected_shrinkage_pct": 4.0,
            "start_immediately": True,
            "notes": "OP Transformación Libre Test Pytest",
            "inputs": [
                {
                    "component_variant_id": 122109,
                    "planned_qty": 50.0,
                    "scrap_factor_pct": 0.0,
                    "input_role": "PRIMARY_MATRIX",
                }
            ],
            "outputs": [
                {
                    "output_variant_id": 122000,
                    "planned_qty": 25.0,
                    "output_type": "MAIN_CUT",
                    "cost_allocation_method": "SALES_VALUE_NRV",
                    "market_reference_price": 10.0,
                },
                {
                    "output_variant_id": 123630,
                    "planned_qty": 20.0,
                    "output_type": "MAIN_CUT",
                    "cost_allocation_method": "SALES_VALUE_NRV",
                    "market_reference_price": 8.0,
                },
            ],
        },
    )
    assert res_create.status_code == 200, res_create.text
    created_op = res_create.json()
    op_id = created_op["id"]
    saved_bom_ids = []

    try:
        assert created_op["bom_id"] is None
        assert created_op["bom_code"] == "TRANSF-LIBRE"
        assert created_op["state"] == "IN_PROGRESS"

        # 3. Verify list_orders includes the Ad-Hoc order by order_number, sector, and TRANSF-LIBRE search
        res_list = client.get(
            "/api/v1/mfg/orders",
            params={"search": created_op["order_number"]},
            headers=auth_headers,
        )
        assert res_list.status_code == 200
        items = res_list.json()["items"]
        assert any(it["id"] == op_id and it["bom_id"] is None and it["bom_code"] == "TRANSF-LIBRE" for it in items)

        res_list_sector = client.get(
            "/api/v1/mfg/orders",
            params={"sector": "MEAT_PROCESSING", "search": "TRANSF-LIBRE"},
            headers=auth_headers,
        )
        assert res_list_sector.status_code == 200
        assert any(it["id"] == op_id for it in res_list_sector.json()["items"])

        # 4. Add dynamic input (packaging tray 121988) and dynamic output (bone byproduct 121996)
        res_add_in = client.post(
            f"/api/v1/mfg/orders/{op_id}/inputs",
            headers=auth_headers,
            json={
                "component_variant_id": 121988,
                "planned_qty": 1.0,
                "scrap_factor_pct": 0.0,
                "input_role": "PACKAGING",
            },
        )
        assert res_add_in.status_code == 200, res_add_in.text
        assert len(res_add_in.json()["inputs"]) == 2

        res_add_out = client.post(
            f"/api/v1/mfg/orders/{op_id}/outputs",
            headers=auth_headers,
            json={
                "output_variant_id": 121996,
                "planned_qty": 3.0,
                "output_type": "BYPRODUCT",
                "cost_allocation_method": "FIXED_NRV",
                "market_reference_price": 1.0,
            },
        )
        assert res_add_out.status_code == 200, res_add_out.text
        updated_op = res_add_out.json()
        assert len(updated_op["outputs"]) == 3

        # 5. Simulate and Complete the Ad-Hoc order (25 + 20 + 3 + 2.0 oreo = 50.0 Kg)
        outputs_payload = []
        for o in updated_op["outputs"]:
            vid = o["output_variant_id"]
            qty = 25.0 if vid == 122000 else (20.0 if vid == 123630 else 3.0)
            outputs_payload.append({
                "output_id": o["id"],
                "output_variant_id": vid,
                "actual_good_qty": qty,
                "explicit_damaged_qty": 0.0,
                "market_reference_price": o["market_reference_price_usd"],
            })

        res_sim = client.post(
            "/api/v1/mfg/butchery/simulate-settlement",
            headers=auth_headers,
            json={
                "order_id": op_id,
                "actual_input_weight_kg": 50.0,
                "actual_labor_hours": 1.0,
                "natural_shrinkage_qty": 2.0,
                "outputs": outputs_payload,
            },
        )
        assert res_sim.status_code == 200, res_sim.text
        assert res_sim.json()["mass_balance"]["is_mass_balanced"] is True

        res_comp = client.post(
            f"/api/v1/mfg/orders/{op_id}/complete",
            headers=auth_headers,
            json={
                "actual_input_weight_kg": 50.0,
                "actual_labor_hours": 1.0,
                "natural_shrinkage_qty": 2.0,
                "outputs": outputs_payload,
            },
        )
        assert res_comp.status_code == 200, res_comp.text
        comp_data = res_comp.json()
        assert comp_data["state"] == "COMPLETED"
        assert comp_data["cost_summary"]["byproduct_credit_usd"] == 3.0

        # Verify mfg.v_fact_production_costing view includes this Ad-Hoc order with TRANSF-LIBRE
        db_check = SessionLocal()
        try:
            row = db_check.execute(
                text("SELECT bom_code, bom_name FROM mfg.v_fact_production_costing WHERE production_order_id = :oid"),
                {"oid": op_id},
            ).fetchone()
            assert row is not None
            assert row[0] == "TRANSF-LIBRE"
        finally:
            db_check.close()

        # 6a. Save Ad-Hoc order as BOM with link_to_order=False (order.bom_id remains None)
        res_save_unlinked = client.post(
            f"/api/v1/mfg/orders/{op_id}/save-as-bom",
            headers=auth_headers,
            json={
                "code": "ADHOC-TEST-UNLINKED-998",
                "name": "Plantilla No Vinculada",
                "link_to_order": False,
            },
        )
        assert res_save_unlinked.status_code == 200, res_save_unlinked.text
        unlinked_bom = res_save_unlinked.json()
        saved_bom_ids.append(unlinked_bom["id"])
        assert unlinked_bom["order"]["bom_id"] is None

        # 6b. Duplicate BOM code is rejected with HTTP 400
        res_save_dup = client.post(
            f"/api/v1/mfg/orders/{op_id}/save-as-bom",
            headers=auth_headers,
            json={
                "code": "ADHOC-TEST-UNLINKED-998",
                "name": "Plantilla Duplicada",
            },
        )
        assert res_save_dup.status_code == 400

        # 6c. Save Ad-Hoc order as reusable BOM template with link_to_order=True (default)
        res_save_bom = client.post(
            f"/api/v1/mfg/orders/{op_id}/save-as-bom",
            headers=auth_headers,
            json={
                "code": "ADHOC-TEST-BOM-999",
                "name": "Plantilla Guardada desde Orden Ad-Hoc",
            },
        )
        assert res_save_bom.status_code == 200, res_save_bom.text
        saved_bom = res_save_bom.json()
        saved_bom_ids.append(saved_bom["id"])
        assert saved_bom["code"] == "ADHOC-TEST-BOM-999"
        assert saved_bom["order"]["bom_id"] == saved_bom["id"]
        assert len(saved_bom["lines"]) == 2
        assert len(saved_bom["outputs"]) == 3
    finally:
        db2 = SessionLocal()
        try:
            order_obj = db2.query(ProductionOrder).filter_by(id=op_id).first()
            if order_obj:
                p_cons_id = order_obj.picking_consumption_id
                p_out_id = order_obj.picking_output_id
                w_move_id = order_obj.waste_move_id
                gen_batch_ids = [o.generated_batch_id for o in order_obj.outputs if o.generated_batch_id]

                for vid in tracked_variant_ids:
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

            for bid in saved_bom_ids:
                bom_obj = db2.query(BOMHeader).filter_by(id=bid).first()
                if bom_obj:
                    db2.delete(bom_obj)

            db2.commit()
        finally:
            db2.close()


