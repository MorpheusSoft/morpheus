import unittest
import json
import time
import urllib.request
from sqlalchemy import text
from app.api.deps import engine
from app.core.security import create_access_token

class TestKardexAndStockReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = create_access_token(1)
        cls.headers = {
            "Authorization": f"Bearer {cls.token}",
            "Content-Type": "application/json"
        }
        cls.base_url = "http://localhost:8000/api/v1"

    def test_01_external_locations_have_null_warehouse(self):
        """Verifica que CUSTOMER, INV_ADJ y VIRTUAL-LOSS tengan warehouse_id = NULL"""
        with engine.connect() as conn:
            locs = conn.execute(text("""
                SELECT code, usage, warehouse_id 
                FROM inv.locations 
                WHERE code IN ('CUSTOMER', 'INV_ADJ', 'VIRTUAL-LOSS') OR usage != 'INTERNAL'
            """)).fetchall()
            for code, usage, wh_id in locs:
                self.assertIsNone(wh_id, f"Ubicación {code} (usage: {usage}) tiene warehouse_id={wh_id}, debería ser NULL")

    def test_02_price_consultant_matches_kardex_and_snapshot(self):
        """Verifica que el consultor de precio devuelva el stock real y coincida con el Kardex y Snapshot"""
        # 1. Consultor de precios
        req_prod = urllib.request.Request(
            f"{self.base_url}/products/by-code/7599218000283?facility_id=13",
            headers=self.headers
        )
        with urllib.request.urlopen(req_prod) as resp:
            self.assertEqual(resp.status, 200)
            data_prod = json.loads(resp.read().decode())

        belisa_stock = None
        for fac in data_prod["stock"]["by_facility"]:
            if fac["facility_id"] == 13:
                belisa_stock = fac["quantity"]
                break

        self.assertIsNotNone(belisa_stock, "No se encontró Belisa (facility 13) en la respuesta del consultor")
        self.assertGreater(belisa_stock, 400.0, "Stock en Belisa debe ser consistente con la apertura")

        # 2. Reporte Kardex
        payload = json.dumps({"product_ids": [20345], "facility_ids": [13]}).encode()
        req_kardex = urllib.request.Request(
            f"{self.base_url}/reports/kardex",
            data=payload,
            headers=self.headers
        )
        with urllib.request.urlopen(req_kardex) as resp:
            self.assertEqual(resp.status, 200)
            data_kardex = json.loads(resp.read().decode())

        self.assertTrue(len(data_kardex) > 0, "Kardex no devolvió resultados para PRD-20345")
        kardex_item = data_kardex[0]
        self.assertEqual(kardex_item["sku"], "PRD-20345")

        wh_kardex = kardex_item["facilities"][0]["warehouses"][0]
        kardex_final = wh_kardex["final_balance"]

        # 3. Snapshot en DB
        with engine.connect() as conn:
            snap_qty = conn.execute(text("""
                SELECT stock_qty FROM inv.inventory_snapshots 
                WHERE variant_id = 20345 AND facility_id = 13
            """)).scalar()
            snap_float = float(snap_qty)

        # 4. Concordancia estricta tripartita
        self.assertEqual(belisa_stock, kardex_final, 
                         f"Discrepancia entre Consultor ({belisa_stock}) y Kardex ({kardex_final})")
        self.assertEqual(belisa_stock, snap_float,
                         f"Discrepancia entre Consultor ({belisa_stock}) y Snapshot ({snap_float})")

    def test_03_kardex_cleanliness_and_no_fake_reallocations(self):
        """Verifica que el Kardex no tenga falsas reubicaciones y que el Baseline abra el periodo"""
        payload = json.dumps({"product_ids": [20345], "facility_ids": [13]}).encode()
        req_kardex = urllib.request.Request(
            f"{self.base_url}/reports/kardex",
            data=payload,
            headers=self.headers
        )
        with urllib.request.urlopen(req_kardex) as resp:
            data_kardex = json.loads(resp.read().decode())

        wh = data_kardex[0]["facilities"][0]["warehouses"][0]
        history = wh["history"]
        self.assertTrue(len(history) > 0)

        # Primer registro debe ser la Apertura (Baseline)
        first_row = history[0]
        self.assertIn("Baseline", first_row["reference"])
        self.assertEqual(first_row["type"], "INVENTARIO INICIAL")
        self.assertEqual(first_row["qty_in"], 567.0)
        self.assertEqual(first_row["balance"], 567.0)

        # Ninguna fila debe ser reubicación con 0/0 hacia cliente
        for row in history:
            if "POS Sale" in row["reference"]:
                self.assertNotEqual(row["flow_type"], "INTERNAL", 
                                    f"La venta {row['reference']} no debe ser clasificada como INTERNAL")
                self.assertIn(row["flow_type"], ["OUT", "IN"])
                if row["flow_type"] == "OUT":
                    self.assertEqual(row["flow_display"], "Salida a Cliente")
                    self.assertTrue(row["qty_out"] > 0, f"Venta {row['reference']} debe tener salida > 0")
                elif row["flow_type"] == "IN":
                    self.assertEqual(row["flow_display"], "Devolución / Reingreso de Cliente")
                    self.assertTrue(row["qty_in"] > 0, f"Devolución {row['reference']} debe tener entrada > 0")

        # El último registro debe tener saldo igual al saldo final
        last_row = history[-1]
        self.assertEqual(last_row["balance"], wh["final_balance"])

    def test_04_trigger_safe_against_innocent_updates(self):
        """Valida que un UPDATE inocente en stock_moves no descuente stock adicionalmente"""
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                init_qty = conn.execute(text("""
                    SELECT stock_qty FROM inv.inventory_snapshots 
                    WHERE variant_id = 20345 AND facility_id = 13
                """)).scalar()

                move = conn.execute(text("""
                    SELECT id FROM inv.stock_moves 
                    WHERE product_id = 20345 AND state = 'DONE' AND location_dest_id = 2 
                    LIMIT 1
                """)).fetchone()
                self.assertIsNotNone(move, "Debe existir al menos un movimiento DONE")

                # Actualización inocente de notas o timestamp
                conn.execute(text(f"""
                    UPDATE inv.stock_moves 
                    SET notes = 'Test Trigger Idempotence' 
                    WHERE id = {move[0]}
                """))

                post_qty = conn.execute(text("""
                    SELECT stock_qty FROM inv.inventory_snapshots 
                    WHERE variant_id = 20345 AND facility_id = 13
                """)).scalar()

                self.assertEqual(init_qty, post_qty, 
                                 f"El trigger sobre-descontó stock en UPDATE inocente! Antes: {init_qty}, Después: {post_qty}")
            finally:
                trans.rollback()

    def test_05_kardex_with_date_filters_fast_and_accurate(self):
        """Verifica que el Kardex con filtro date_from responda en < 2s y calcule correctamente el saldo inicial"""
        t0 = time.time()
        payload = json.dumps({
            "product_ids": [20345], 
            "facility_ids": [13],
            "date_from": "2026-09-25T00:00:00Z"
        }).encode()
        req_kardex = urllib.request.Request(
            f"{self.base_url}/reports/kardex",
            data=payload,
            headers=self.headers
        )
        with urllib.request.urlopen(req_kardex) as resp:
            self.assertEqual(resp.status, 200)
            data_kardex = json.loads(resp.read().decode())
        t1 = time.time()
        duration = t1 - t0

        self.assertLess(duration, 2.0, f"Kardex con date_from tardó demasiado: {duration:.2f}s")
        wh = data_kardex[0]["facilities"][0]["warehouses"][0]
        self.assertGreater(wh["initial_balance"], 0, "El saldo inicial al inicio del día debe ser > 0")
        self.assertEqual(wh["history"][0]["reference"], "SALDO INICIAL")
        self.assertEqual(wh["history"][0]["balance"], wh["initial_balance"])

if __name__ == "__main__":
    unittest.main()
