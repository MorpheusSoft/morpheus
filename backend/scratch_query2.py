import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import SessionLocal
from app.models.inventory import ProductVariant, StockMove
from sqlalchemy import func

db = SessionLocal()
variant = db.query(ProductVariant).filter(ProductVariant.sku == 'PRD-108103').first()
print(f"Variant: {variant.id}, sku: {variant.sku}")
print(f"Variant quantity from model property if any...")
try:
    print(variant.quantity)
except Exception as e:
    print(e)
