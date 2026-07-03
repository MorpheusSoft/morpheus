from sqlalchemy import create_engine, text

engine = create_engine("postgresql://postgres:Pegaso#26@localhost/morpheus")
with engine.connect() as conn:
    print("Exchange Rates History:")
    res = conn.execute(text("select id, currency_id, rate, effective_date from core.exchange_rates")).fetchall()
    for r in res:
        print(r)
        
    print("\nExchange Rate Audit Logs:")
    res = conn.execute(text("select id, user_id, old_rate, new_rate, reason, created_at from core.exchange_rate_audit_logs")).fetchall()
    for r in res:
        print(r)
