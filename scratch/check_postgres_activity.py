import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    # Get active queries
    sql = """
    SELECT pid, state, query, age(clock_timestamp(), query_start) as duration, wait_event_type, wait_event
    FROM pg_stat_activity
    WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%';
    """
    res = db.execute(text(sql)).fetchall()
    print("Active queries:")
    for r in res:
        print(f"PID: {r.pid} | State: {r.state} | Duration: {r.duration} | Wait Event: {r.wait_event_type}:{r.wait_event} | Query: {r.query[:100]}")
        
    # Get locks
    sql_locks = """
    SELECT relation::regclass, mode, granted, pid, query
    FROM pg_locks l
    JOIN pg_stat_activity a ON l.pid = a.pid
    WHERE relation IS NOT NULL AND query NOT LIKE '%pg_stat_activity%';
    """
    locks = db.execute(text(sql_locks)).fetchall()
    print("\nLocks:")
    for l in locks:
        print(f"Relation: {l.relation} | Mode: {l.mode} | Granted: {l.granted} | PID: {l.pid} | Query: {l.query[:100]}")
finally:
    db.close()
