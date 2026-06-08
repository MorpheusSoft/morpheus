import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from datetime import datetime, timedelta
from jose import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.api.deps import SessionLocal
from app.models.inventory import PricingSession, PricingSessionLine
from app.core import security

# Generate token for user id 1
expire = datetime.utcnow() + timedelta(minutes=15)
to_encode = {"exp": expire, "sub": str(1)}
token = jwt.encode(to_encode, security.SECRET_KEY, algorithm=security.ALGORITHM)

client = TestClient(app)
headers = {"Authorization": f"Bearer {token}"}

db = SessionLocal()
try:
    # 1. Create a draft session
    session = PricingSession(
        name="Test Session Delete Line",
        source_type="FILTER_BULK",
        status="DRAFT",
        update_type="PRICE",
        created_by=1
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # 2. Add a line
    line = PricingSessionLine(
        session_id=session.id,
        variant_id=None,
        old_price=10.0,
        proposed_price=12.0,
        action="UPDATE_COST"
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    
    print(f"Created Session ID: {session.id}, Line ID: {line.id}")
    
    # 3. Test DELETE call via Client
    url = f"/api/v1/pricing-sessions/{session.id}/lines/{line.id}"
    print(f"Calling DELETE {url}")
    res = client.delete(url, headers=headers)
    print("Status code:", res.status_code)
    try:
        print("JSON:", res.json())
    except Exception:
        print("Text:", res.text)
        
    # Clean up session (cascade will delete line if not deleted)
    db.delete(session)
    db.commit()
finally:
    db.close()
