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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initiate the polling daemon
    daemon_task = asyncio.create_task(run_background_poller())
    yield
    daemon_task.cancel()

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
        "http://127.0.0.1:4000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://hub.qa.morpheussoft.net",
        "https://compras.qa.morpheussoft.net",
        "https://inventario.qa.morpheussoft.net",
        "https://logistica.qa.morpheussoft.net"
    ],
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
    print(f"OMFG 422 ERROR! Body: {exc.body}")
    print(f"Details: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors(), "body": exc.body})

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
