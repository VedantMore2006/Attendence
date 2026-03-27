from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import init_database, router


app = FastAPI(
    title="Smart Attendance API",
    version="1.0.0",
    description="Prototype-ready backend for user registration and attendance tracking.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_database()


app.include_router(router, prefix="/api")
