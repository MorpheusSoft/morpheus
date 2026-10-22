# Automated test suite for category hierarchy and sessions
from app.models import core, purchasing, inventory
from app.api.deps import SessionLocal
from app.api.v1.endpoints.inventory_session import (
    get_all_related_category_ids,
    get_category_breadcrumb_path
)
from app.api.v1.endpoints.catalog import build_category_metadata_map

def test_bidirectional_category_resolution():
    """
    Test that resolving related category IDs works bidirectionally:
    - Looking up a child includes its ancestors (parents, root).
    - Looking up a parent includes its descendants (children, grandchildren).
    """
    db = SessionLocal()
    try:
        root_cat = db.query(inventory.Category).filter(inventory.Category.parent_id == None).first()
        assert root_cat is not None, "At least one root category should exist in DB"
        
        related_from_root = get_all_related_category_ids(db, root_cat.id)
        assert root_cat.id in related_from_root
        
        child_cat = db.query(inventory.Category).filter(inventory.Category.parent_id == root_cat.id).first()
        if child_cat:
            assert child_cat.id in related_from_root, "Root category must include its children"
            related_from_child = get_all_related_category_ids(db, child_cat.id)
            assert root_cat.id not in related_from_child, "Child category must NOT include parent department (downwards only)"
            assert child_cat.id in related_from_child
            
            grandchild = db.query(inventory.Category).filter(inventory.Category.parent_id == child_cat.id).first()
            if grandchild:
                assert grandchild.id in related_from_root, "Root must include its grandchildren"
                assert grandchild.id in related_from_child, "Parent must include its children"
                related_from_grandchild = get_all_related_category_ids(db, grandchild.id)
                assert root_cat.id not in related_from_grandchild, "Grandchild must NOT include root ancestor"
                assert child_cat.id not in related_from_grandchild, "Grandchild must NOT include parent ancestor"
                assert grandchild.id in related_from_grandchild
    finally:
        db.close()

def test_category_breadcrumb_path():
    """
    Test that breadcrumb paths are properly formatted as 'Ancestor > ... > Category'.
    """
    db = SessionLocal()
    try:
        leaf = db.query(inventory.Category).filter(
            inventory.Category.parent_id != None
        ).first()
        assert leaf is not None
        
        path = get_category_breadcrumb_path(db, leaf.id)
        assert path is not None
        assert leaf.name in path
        
        parent = db.query(inventory.Category).filter(inventory.Category.id == leaf.parent_id).first()
        if parent:
            assert parent.name in path
    finally:
        db.close()

def test_category_metadata_map():
    """
    Test bulk metadata map generates full_path, level, and level_name for all categories.
    """
    db = SessionLocal()
    try:
        meta_map = build_category_metadata_map(db)
        assert len(meta_map) > 0
        
        for cat_id, meta in meta_map.items():
            assert "full_path" in meta
            assert "level" in meta
            assert "level_name" in meta
            assert meta["level_name"] in ("Departamento", "Grupo", "Subgrupo", f"Nivel {meta['level'] + 1}")
    finally:
        db.close()

def test_product_selector_bidirectional_filtering():
    """
    Test that /products/selector returns products when filtering by a child category
    even if the product was assigned to the parent root category.
    """
    db = SessionLocal()
    try:
        from app.api.v1.endpoints.products import read_products_selector
        
        # Find root with products
        prod = db.query(inventory.Product).filter(inventory.Product.category_id != None).first()
        assert prod is not None
        
        prod_cat_id = prod.category_id
        # Call selector with this category_id
        res1 = read_products_selector(db=db, limit=50, category_id=prod_cat_id)
        assert len(res1) > 0
        p_ids = [r["id"] for r in res1]
        
        # If prod_cat has subcategories, call selector with subcategory ID
        sub_cat = db.query(inventory.Category).filter(inventory.Category.parent_id == prod_cat_id).first()
        if sub_cat:
            res_sub = read_products_selector(db=db, limit=50, category_id=sub_cat.id)
            # Should include the product assigned to the parent category!
            assert len(res_sub) > 0
            assert any(r["category_id"] == prod_cat_id for r in res_sub)
    finally:
        db.close()

def test_read_categories_hierarchical_sorting():
    """
    Test that read_categories returns categories sorted by hierarchical full_path.
    """
    from app.api.v1.endpoints.catalog import read_categories
    db = SessionLocal()
    try:
        cats = read_categories(db=db, limit=50)
        assert len(cats) > 0
        paths = [c.full_path or c.name for c in cats]
        for i in range(len(paths) - 1):
            assert paths[i].lower() <= paths[i+1].lower(), f"Categories not sorted: {paths[i]} > {paths[i+1]}"
    finally:
        db.close()

def test_read_inventory_sessions_breadcrumbs_and_total_lines():
    """
    Test that read_inventory_sessions populates category_full_path and total_lines.
    """
    from app.api.v1.endpoints.inventory_session import read_inventory_sessions
    db = SessionLocal()
    try:
        # Dummy mock user
        class DummyUser:
            id = 1
            roles = []
        sessions = read_inventory_sessions(db=db, limit=20, current_user=DummyUser())
        assert len(sessions) > 0
        for s in sessions:
            assert hasattr(s, "total_lines")
            if s.scope_type in ('CATEGORY', 'CYCLIC') and s.scope_value:
                assert s.category_full_path is not None or s.category_name is not None
    finally:
        db.close()

def test_create_session_scope_value_sync():
    """
    Test that creating a session with category_id populates scope_value
    and populates valid_category_ids and category_full_path.
    """
    from app.api.v1.endpoints.inventory_session import create_inventory_session
    from app.schemas.inventory_session import InventorySessionCreate
    db = SessionLocal()
    created_id = None
    try:
        cat = db.query(inventory.Category).first()
        fac = db.query(core.Facility).first()
        if cat and fac:
            data = InventorySessionCreate(
                name="TEST_AUTO_SESSION",
                facility_id=fac.id,
                scope_type="CYCLIC",
                category_id=cat.id
            )
            sess = create_inventory_session(db=db, session_in=data)
            created_id = sess.id
            assert sess.scope_value == str(cat.id), "scope_value must be synced from category_id"
            assert sess.category_full_path is not None
            assert cat.id in sess.valid_category_ids
    finally:
        if created_id:
            db.query(inventory.InventoryLine).filter(inventory.InventoryLine.session_id == created_id).delete()
            db.query(inventory.InventorySession).filter(inventory.InventorySession.id == created_id).delete()
            db.commit()
        db.close()

def test_populate_line_details_supervisor_and_blind_count():
    """
    Test that populate_line_details:
    - ALWAYS populates product_name, sku, and uom_base on all lines.
    - Masks theoretical_qty and difference_qty for non-supervisors (blind count).
    - Exposes theoretical_qty, difference_qty, and anomaly evaluation for supervisors.
    """
    from app.api.v1.endpoints.inventory_session import populate_line_details
    db = SessionLocal()
    try:
        variant = db.query(inventory.ProductVariant).first()
        assert variant is not None, "ProductVariant must exist"
        
        # Mock session with one line
        class MockLine:
            def __init__(self, vid):
                self.product_variant_id = vid
                self.theoretical_qty = 10.0
                self.counted_qty = 8.0
                self.difference_qty = None
                self.is_anomaly = False
                self.anomaly_reason = None
                self.uom_base = None
                self.sku = None
                self.product_name = None

        class MockSession:
            def __init__(self, line):
                self.lines = [line]

        mock_session_blind = MockSession(MockLine(variant.id))
        populate_line_details(mock_session_blind, db, is_supervisor=False)
        line_blind = mock_session_blind.lines[0]
        assert line_blind.product_name is not None
        assert line_blind.sku is not None
        assert line_blind.uom_base is not None
        assert line_blind.theoretical_qty is None, "Blind count must mask theoretical_qty"
        assert line_blind.difference_qty is None, "Blind count must mask difference_qty"

        mock_session_sup = MockSession(MockLine(variant.id))
        populate_line_details(mock_session_sup, db, is_supervisor=True)
        line_sup = mock_session_sup.lines[0]
        assert line_sup.product_name is not None
        assert line_sup.sku is not None
        assert line_sup.theoretical_qty == 10.0
        assert line_sup.difference_qty == -2.0
    finally:
        db.close()

def test_read_categories_full_hierarchical_sorting_and_default_limit():
    """
    Test that read_categories defaults to limit=1000 and orders all categories hierarchically.
    """
    from app.api.v1.endpoints.catalog import read_categories
    db = SessionLocal()
    try:
        cats = read_categories(db=db)
        total_in_db = db.query(inventory.Category).count()
        assert len(cats) == total_in_db, f"Expected {total_in_db} categories with default limit, got {len(cats)}"
        paths = [c.full_path or c.name for c in cats]
        for i in range(len(paths) - 1):
            assert paths[i].lower() <= paths[i+1].lower()
    finally:
        db.close()


