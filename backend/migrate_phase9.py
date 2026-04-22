import sys
sys.path.append("/home/lzambrano/Desarrollo/Morpheus/backend")

from app.api.deps import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        with conn.begin():
            # Create system_jobs table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS core.system_jobs (
                    id SERIAL PRIMARY KEY,
                    job_code VARCHAR NOT NULL UNIQUE,
                    name VARCHAR NOT NULL,
                    is_enabled BOOLEAN DEFAULT TRUE,
                    execution_time TIME NOT NULL,
                    last_executed_at TIMESTAMP WITH TIME ZONE
                );
            """))
            print("Table core.system_jobs created.")

            # Seed the initial MRP Nocturnal Job
            conn.execute(text("""
                INSERT INTO core.system_jobs (job_code, name, is_enabled, execution_time)
                VALUES ('mrp_nightly_consolidation', 'Autómata de Consolidación MRP', TRUE, '02:00:00')
                ON CONFLICT (job_code) DO NOTHING;
            """))
            print("Job mrp_nightly_consolidation seeded.")

if __name__ == "__main__":
    run_migration()
    print("Migration Phase 9 completed successfully.")
