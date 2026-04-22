ALTER TABLE pur.supplier_products DROP CONSTRAINT IF EXISTS supplier_products_pack_id_fkey;
ALTER TABLE pur.supplier_products ADD CONSTRAINT supplier_products_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES inv.product_packagings(id) ON DELETE SET NULL;
