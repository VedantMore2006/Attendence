import logging
import os
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.errors import AppError, app_error_handler, unhandled_error_handler
from api.routes import init_database, router

# ── Logging ───────────────────────────────────────────────────────────────────

os.makedirs("logs", exist_ok=True)

_fmt = logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_console = logging.StreamHandler()
_console.setLevel(logging.INFO)
_console.setFormatter(_fmt)

_file = RotatingFileHandler(
    "logs/attendance.log",
    maxBytes=5 * 1024 * 1024,   # 5 MB per file
    backupCount=3,
    encoding="utf-8",
)
_file.setLevel(logging.DEBUG)   # capture DEBUG too so scan pipeline is traceable
_file.setFormatter(_fmt)

root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)
root_logger.addHandler(_console)
root_logger.addHandler(_file)

logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once on startup and once on shutdown.

    Startup order:
      1. Initialise SQLite schema (idempotent).
      2. Load FaceDetector + FaceAligner (fast, pure-OpenCV/MediaPipe).
      3. Load FaceEmbedder (lazy-loads the ArcFace ONNX model — can be slow).

    If the vision pipeline fails to load the API still starts; face-scan
    endpoints will return 503 until the problem is resolved.
    """

    logger.info("=" * 60)
    logger.info("Smart Attendance API — session start")
    logger.info("=" * 60)

    # ── 1. Database ───────────────────────────────────────────────────────────
    logger.info("Initialising database schema...")
    try:
        init_database()
        logger.info("Database ready")
    except Exception as exc:
        logger.critical("Database initialisation failed: %s", exc)
        raise  # hard failure — no point continuing without a DB

    # ── 2 & 3. Vision pipeline ────────────────────────────────────────────────
    logger.info("Loading vision pipeline (detector / aligner / embedder)...")
    try:
        from vision.aligner import FaceAligner
        from vision.detector import FaceDetector
        from vision.embedder import FaceEmbedder

        app.state.detector = FaceDetector()
        logger.info("FaceDetector ready")

        app.state.aligner = FaceAligner()
        logger.info("FaceAligner ready")

        embedder = FaceEmbedder()
        embedder._ensure_model_loaded()          # trigger eager load here
        app.state.embedder = embedder
        app.state.model_ready = True
        logger.info("FaceEmbedder (ArcFace) ready — face scan is available")

    except Exception as exc:
        logger.error(
            "Vision pipeline failed to load: %s  |  "
            "Face-scan endpoints will return 503 until this is fixed.",
            exc,
        )
        # Attach None-safe stubs so attribute access never raises AttributeError
        app.state.detector = None
        app.state.aligner = None
        app.state.embedder = None
        app.state.model_ready = False

    yield  # ←── application runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Smart Attendance API shutting down")


# ── App ───────────────────────────────────────────────────────────────────────


app = FastAPI(
    title="Smart Attendance API",
    version="1.0.0",
    description="Face-recognition-based attendance tracking backend.",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────
# Order matters: the specific AppError handler must be registered first so
# FastAPI picks it up before the catch-all Exception handler.

app.add_exception_handler(AppError, app_error_handler)          # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_error_handler)   # type: ignore[arg-type]

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(router, prefix="/api")
