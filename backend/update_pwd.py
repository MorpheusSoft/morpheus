from app.api.deps import SessionLocal
from app.models.core import User
from app.core.security import get_password_hash

try:
    db = SessionLocal()
    user = db.query(User).filter_by(email='admin@morpheus.com').first()
    if user:
        user.email = 'admin@neo.com'
        user.hashed_password = get_password_hash('admin')
        print("Updating existing user...")
    else:
        user = db.query(User).filter_by(email='admin@neo.com').first()
        if user:
            user.hashed_password = get_password_hash('admin')
            print("Updating admin@neo.com password...")
        else:
            user = User(email='admin@neo.com', hashed_password=get_password_hash('admin'), is_superuser=True)
            db.add(user)
            print("Creating new user...")
    db.commit()
    print('USER_UPDATED')
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
