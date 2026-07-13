from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
import uvicorn

from contextlib import asynccontextmanager
import asyncio

async def run_background_poller():
    from app.services.jobs_service import poll_and_execute_jobs
    while True:
        try:
            poll_and_execute_jobs()
        except Exception as e:
            print(f"[CRON FATAL ERROR] {e}")
        await asyncio.sleep(60)

async def run_mrp_bot_scheduler():
    from app.services.mrp_bot_service import run_mrp_bot
    from app.api.deps import SessionLocal
    from app.models.purchasing import MRPBotLog
    import datetime
    import asyncio
    import pytz
    
    print("[MRP BOT SCHEDULER] Iniciando...")
    tz = pytz.timezone("America/Caracas")
    while True:
        try:
            now = datetime.datetime.now(tz)
            if now.hour == 3:
                db = SessionLocal()
                try:
                    today_start = datetime.datetime.combine(now.date(), datetime.time.min).replace(tzinfo=tz)
                    already_run = db.query(MRPBotLog).filter(
                        MRPBotLog.executed_at >= today_start
                    ).first()
                    if not already_run:
                        print(f"[MRP BOT SCHEDULER] Ejecutando bot automático diario a las {now}...")
                        await run_mrp_bot(db)
                except Exception as ex:
                    print(f"[MRP BOT SCHEDULER ERROR] Fallo durante ejecución: {ex}")
                finally:
                    db.close()
        except Exception as e:
            print(f"[MRP BOT SCHEDULER ERROR] {e}")
        await asyncio.sleep(60)

def init_bot_log_db():
    from app.api.deps import engine
    from app.db.base_class import Base
    from app.models.purchasing import MRPBotLog
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS pur;"))
            conn.commit()
        Base.metadata.create_all(bind=engine, tables=[MRPBotLog.__table__])
        print("[DATABASE] Table pur.mrp_bot_logs verified/created successfully.")
    except Exception as e:
        print(f"[DATABASE ERROR] Failed to initialize bot log table: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database tables for bot log
    init_bot_log_db()
    # Initiate the polling daemon and bot scheduler
    daemon_task = asyncio.create_task(run_background_poller())
    bot_scheduler_task = asyncio.create_task(run_mrp_bot_scheduler())
    yield
    daemon_task.cancel()
    bot_scheduler_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3005",
        "http://localhost:4000",
        "http://localhost:4001",
        "http://localhost:4002",
        "http://localhost:4003",
        "http://localhost:4004",
        "http://localhost:4005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3005",
        "http://127.0.0.1:4000",
        "http://127.0.0.1:4001",
        "http://127.0.0.1:4002",
        "http://127.0.0.1:4003",
        "http://127.0.0.1:4004",
        "http://127.0.0.1:4005",
        "https://hub.qa.morpheussoft.net",
        "https://compras.qa.morpheussoft.net",
        "http://costos.qa.morpheussoft.net",
        "https://costos.qa.morpheussoft.net",
        "https://inventario.qa.morpheussoft.net",
        "https://logistica.qa.morpheussoft.net",
        "https://costos.qa.morpheussoft.net"
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

from fastapi.staticfiles import StaticFiles
import os

# Create static dir if not exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return {"message": "Welcome to Inventory ERP API", "docs": "/docs"}

from fastapi.exceptions import RequestValidationError
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    safe_errors = []
    for error in errors:
        error_copy = dict(error)
        error_copy.pop('input', None)
        safe_errors.append(error_copy)
    print(f"OMFG 422 ERROR! Body: {exc.body}")
    print(f"Details: {safe_errors}")
    body_str = str(exc.body) if exc.body else None
    return JSONResponse(status_code=422, content={"detail": safe_errors, "body": body_str})

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
