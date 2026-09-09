import sys
import os

# Add backend directory to python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.deps import engine
from sqlalchemy import text

def seed_bcv_job():
    with engine.connect() as conn:
        with conn.begin():
            # Fix sequence if needed
            conn.execute(text("""
                SELECT setval(pg_get_serial_sequence('core.system_jobs', 'id'), COALESCE(max(id), 1)) FROM core.system_jobs;
                INSERT INTO core.system_jobs (job_code, name, is_enabled, execution_time)
                VALUES ('bcv_daily_rate_sync', 'Sincronización Diaria Tasa BCV', TRUE, '06:00:00')
                ON CONFLICT (job_code) DO NOTHING;
            """))
            print("Job 'bcv_daily_rate_sync' sembrado exitosamente en core.system_jobs.")

if __name__ == "__main__":
    seed_bcv_job()
