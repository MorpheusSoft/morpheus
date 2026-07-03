from app.db.session import SessionLocal
from app.models.inventory import StockMove, ProductVariant, Location, Warehouse
from app.models.core import Facility

db = SessionLocal()
variant = db.query(ProductVariant).filter(ProductVariant.sku == 'PRD-108103').first()
if not variant:
    print("Variant not found")
    exit(1)

print(f"Found variant: {variant.id} - {variant.sku}")

moves = db.query(StockMove).filter(StockMove.product_id == variant.id).all()
print(f"Total moves: {len(moves)}")
for m in moves:
    loc_src = db.query(Location).get(m.location_src_id) if m.location_src_id else None
    loc_dst = db.query(Location).get(m.location_dest_id) if m.location_dest_id else None
    print(f"Move {m.id}: date={m.date}, state={m.state}, qty={m.quantity_done}, src={loc_src.name if loc_src else None}, dst={loc_dst.name if loc_dst else None}")
