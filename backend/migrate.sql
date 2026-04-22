ALTER TABLE pur.supplier_products ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION pur.sync_replacement_cost()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.is_primary = TRUE THEN
        UPDATE pur.supplier_products
        SET is_primary = FALSE
        WHERE variant_id = NEW.variant_id
          AND id != NEW.id
          AND is_primary = TRUE;

        UPDATE inv.product_variants
        SET replacement_cost = NEW.replacement_cost
        WHERE id = NEW.variant_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_replacement_cost ON pur.supplier_products;
CREATE TRIGGER trg_sync_replacement_cost
AFTER INSERT OR UPDATE ON pur.supplier_products
FOR EACH ROW
WHEN (NEW.is_primary = TRUE)
EXECUTE FUNCTION pur.sync_replacement_cost();
