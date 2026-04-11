import base64
import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.errors import (
    DatabaseError,
    EmbeddingError,
    ImageDecodeError,
    ModelNotReadyError,
)
from attendance.attendance_service import AttendanceService
from database.models import FaceDatabase

logger = logging.getLogger(__name__)

DB_PATH = "attendance.db"
MATCH_THRESHOLD = 0.55

router = APIRouter(tags=["attendance"])


# ── Pydantic models ───────────────────────────────────────────────────────────


class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    images: list[str] = Field(
        default_factory=list,
        description="Base64-encoded JPEG face images captured during registration",
    )


class UserResponse(BaseModel):
    id: int
    name: str
    created_at: str


class CreateUserResponse(BaseModel):
    id: int
    name: str
    created_at: str
    embeddings_stored: int
    embeddings_failed: int


class MarkAttendanceRequest(BaseModel):
    user_id: int


class AttendanceRecordResponse(BaseModel):
    id: int
    user_id: int
    name: str
    date: str
    time: str
    checkout_time: Optional[str] = None


class StatsTodayResponse(BaseModel):
    date: str
    total_users: int
    present_users: int        # checked in (includes those who have also checked out)
    currently_present: int    # checked in but NOT yet checked out
    checked_out_count: int    # checked in AND checked out
    attendance_percent: float


class ScanAttendanceRequest(BaseModel):
    image: str = Field(
        ...,
        description="Base64-encoded JPEG frame (data-URI prefix is stripped automatically)",
    )


class ScanAttendanceResponse(BaseModel):
    status: str  # marked | already_marked | no_face | no_match
    message: str = ""
    name: Optional[str] = None
    time: Optional[str] = None
    user_id: Optional[int] = None
    confidence: Optional[float] = None


# ── DB dependency ─────────────────────────────────────────────────────────────


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_database() -> None:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    try:
        FaceDatabase(conn)
    finally:
        conn.close()


# ── Image / vision helpers ────────────────────────────────────────────────────


def decode_base64_image(b64_str: str) -> np.ndarray:
    """
    Decode a base64 string (with or without a data-URI prefix) into an
    OpenCV BGR ndarray.

    Raises ImageDecodeError on any failure so callers never see raw exceptions.
    """
    if not b64_str or not b64_str.strip():
        raise ImageDecodeError("Image data is empty")

    # Strip "data:image/...;base64," prefix if present
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]

    b64_str = b64_str.strip()

    try:
        raw_bytes = base64.b64decode(b64_str, validate=True)
    except Exception as exc:
        raise ImageDecodeError(f"Base64 decoding failed: {exc}") from exc

    if len(raw_bytes) == 0:
        raise ImageDecodeError("Decoded image data is empty")

    np_arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        raise ImageDecodeError(
            "Could not decode image — unsupported format or corrupt data"
        )

    h, w = frame.shape[:2]
    if h < 10 or w < 10:
        raise ImageDecodeError(
            f"Image is too small to process ({w}x{h} px)"
        )

    return frame


def _pick_largest_box(boxes: list[list[int]]) -> list[int]:
    """Return the bounding box with the largest area."""
    return max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _match_embedding(
    query: np.ndarray,
    face_data: dict,
) -> tuple[Optional[int], Optional[str], float]:
    """
    Compare query embedding against all stored embeddings.

    Returns (best_user_id, best_name, best_score).
    Returns (None, None, best_score) when no user clears MATCH_THRESHOLD.
    """
    best_id: Optional[int] = None
    best_name: Optional[str] = None
    best_score: float = -1.0

    for user_id, data in face_data.items():
        for stored_emb in data["embeddings"]:
            score = _cosine_similarity(query, stored_emb)
            if score > best_score:
                best_score = score
                best_id = user_id
                best_name = data["name"]

    if best_score >= MATCH_THRESHOLD:
        return best_id, best_name, best_score

    return None, None, best_score


def _extract_embedding_from_frame(
    frame: np.ndarray,
    request: Request,
) -> Optional[np.ndarray]:
    """
    Run the full detect → align → embed pipeline on a single frame.

    Returns the embedding ndarray, or None if no usable face was found.
    Raises EmbeddingError on pipeline failures (not "no face" cases).
    """
    detector = request.app.state.detector
    aligner = request.app.state.aligner
    embedder = request.app.state.embedder

    try:
        boxes = detector.detect_faces(frame)
    except Exception as exc:
        logger.error("Face detection error: %s", exc)
        raise EmbeddingError("Face detection failed internally") from exc

    if not boxes:
        return None

    box = _pick_largest_box(boxes)

    try:
        face = aligner.align_face(frame, box)
    except Exception as exc:
        logger.error("Face alignment error: %s", exc)
        return None  # non-fatal — alignment is best-effort

    if face is None:
        return None

    try:
        embedding = embedder.get_embedding(face)
    except Exception as exc:
        logger.error("Embedding extraction error: %s", exc)
        raise EmbeddingError(f"Embedding extraction failed: {exc}") from exc

    return embedding  # may still be None if embedder returns None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/health")
def health(request: Request) -> dict:
    model_ready: bool = getattr(request.app.state, "model_ready", False)
    return {
        "status": "ok",
        "service": "smart-attendance-api",
        "model_ready": model_ready,
    }


# ── Users ─────────────────────────────────────────────────────────────────────


@router.post("/users", response_model=CreateUserResponse, status_code=201)
def create_user(
    payload: CreateUserRequest,
    request: Request,
    conn=Depends(get_connection),
):
    """
    Create a new user and optionally store face embeddings from the provided
    base64 images.  The user record is always created; embedding failures are
    reported in the response rather than rolling back the user.
    """
    cleaned_name = payload.name.strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    face_db = FaceDatabase(conn)

    try:
        user_id = face_db.add_user(cleaned_name)
    except sqlite3.Error as exc:
        logger.error("DB error creating user: %s", exc)
        raise DatabaseError(f"Failed to create user: {exc}") from exc

    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, created_at FROM users WHERE id = ?", (user_id,)
        )
        row = cursor.fetchone()
    except sqlite3.Error as exc:
        logger.error("DB error reading new user row: %s", exc)
        raise DatabaseError() from exc

    embeddings_stored = 0
    embeddings_failed = 0

    if payload.images:
        model_ready: bool = getattr(request.app.state, "model_ready", False)
        if not model_ready:
            logger.warning(
                "Images provided for user %d but model is not ready — skipping", user_id
            )
            embeddings_failed = len(payload.images)
        else:
            for idx, img_b64 in enumerate(payload.images):
                try:
                    frame = decode_base64_image(img_b64)
                    embedding = _extract_embedding_from_frame(frame, request)
                    if embedding is None:
                        logger.debug("Image %d: no face detected, skipping", idx)
                        embeddings_failed += 1
                        continue
                    face_db.add_embedding(user_id, embedding)
                    embeddings_stored += 1
                except (ImageDecodeError, EmbeddingError) as exc:
                    logger.warning("Image %d: %s", idx, exc.message)
                    embeddings_failed += 1
                except sqlite3.Error as exc:
                    logger.error("DB error storing embedding %d: %s", idx, exc)
                    embeddings_failed += 1
                except Exception as exc:
                    logger.error("Unexpected error on image %d: %s", idx, exc)
                    embeddings_failed += 1

    return CreateUserResponse(
        id=row["id"],
        name=row["name"],
        created_at=row["created_at"],
        embeddings_stored=embeddings_stored,
        embeddings_failed=embeddings_failed,
    )


@router.get("/users", response_model=list[UserResponse])
def list_users(conn=Depends(get_connection)):
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, created_at FROM users ORDER BY id DESC"
        )
        rows = cursor.fetchall()
    except sqlite3.Error as exc:
        logger.error("DB error listing users: %s", exc)
        raise DatabaseError() from exc

    return [
        UserResponse(id=r["id"], name=r["name"], created_at=r["created_at"])
        for r in rows
    ]


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, conn=Depends(get_connection)):
    """
    Delete a user and cascade-delete associated embeddings and attendance records.
    Returns 204 No Content on success.
    """
    try:
        cursor = conn.cursor()

        # Check user exists
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Cascade delete: embeddings → attendance → user
        cursor.execute("DELETE FROM face_embeddings WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM attendance WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))

        conn.commit()
        logger.info("DELETE user: id=%d", user_id)

    except HTTPException:
        raise
    except sqlite3.Error as exc:
        logger.error("DB error deleting user %d: %s", user_id, exc)
        raise DatabaseError("Failed to delete user") from exc


# ── Attendance ────────────────────────────────────────────────────────────────


@router.post("/attendance/mark")
def mark_attendance(
    payload: MarkAttendanceRequest, conn=Depends(get_connection)
):
    """Manual attendance mark by user_id (used internally / testing)."""
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM users WHERE id = ?", (payload.user_id,))
        user_row = cursor.fetchone()
    except sqlite3.Error as exc:
        logger.error("DB error looking up user %d: %s", payload.user_id, exc)
        raise DatabaseError() from exc

    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        attendance_service = AttendanceService(conn)
        marked = attendance_service.mark_attendance(payload.user_id)
    except sqlite3.Error as exc:
        logger.error("DB error marking attendance: %s", exc)
        raise DatabaseError() from exc

    today = datetime.now().date().isoformat()
    base = {"user_id": payload.user_id, "name": user_row["name"], "date": today}

    if not marked:
        return {"status": "already_marked", **base}

    return {"status": "marked", **base}


@router.post("/attendance/scan", response_model=ScanAttendanceResponse)
def scan_attendance(
    payload: ScanAttendanceRequest,
    request: Request,
    conn=Depends(get_connection),
):
    """
    Face-scan endpoint.  Accepts a base64 webcam frame, runs the full
    detect → align → embed → match pipeline, then records attendance.

    Status values returned to the client:
      marked          — attendance successfully recorded
      already_marked  — user already checked in today
      no_face         — no face detected (or embedding failed)
      no_match        — face detected but no registered user matched
    """

    # ── 1. Model availability ─────────────────────────────────────────────────
    if not getattr(request.app.state, "model_ready", False):
        raise ModelNotReadyError()

    # ── 2. Decode image ───────────────────────────────────────────────────────
    frame = decode_base64_image(payload.image)

    # ── 3. Detect faces ───────────────────────────────────────────────────────
    detector = request.app.state.detector
    logger.debug("SCAN step 3: running face detection on frame %dx%d", frame.shape[1], frame.shape[0])
    try:
        boxes = detector.detect_faces(frame)
    except Exception as exc:
        logger.error("Face detection failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Face detection failed internally")

    logger.debug("SCAN step 3: detected %d face(s)", len(boxes))
    if not boxes:
        logger.info("SCAN result=no_face  reason=no_boxes")
        return ScanAttendanceResponse(
            status="no_face",
            message="No face detected. Please look directly at the camera.",
        )

    # ── 4. Align face ─────────────────────────────────────────────────────────
    aligner = request.app.state.aligner
    box = _pick_largest_box(boxes)
    logger.debug("SCAN step 4: aligning face box=%s", box)
    try:
        face = aligner.align_face(frame, box)
    except Exception as exc:
        logger.error("Face alignment failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Face alignment failed internally")

    if face is None:
        logger.info("SCAN result=no_face  reason=align_returned_none  box=%s", box)
        return ScanAttendanceResponse(
            status="no_face",
            message="Could not crop face from image. Please reposition.",
        )

    logger.debug("SCAN step 4: aligned face shape=%s", face.shape)

    # ── 5. Extract embedding ──────────────────────────────────────────────────
    embedder = request.app.state.embedder
    logger.debug("SCAN step 5: extracting embedding")
    try:
        embedding = embedder.get_embedding(face)
    except Exception as exc:
        logger.error("Embedding extraction failed: %s", exc, exc_info=True)
        raise EmbeddingError()

    if embedding is None:
        logger.info("SCAN result=no_face  reason=embedding_is_none")
        return ScanAttendanceResponse(
            status="no_face",
            message="Face detected but features could not be extracted. Try better lighting.",
        )

    logger.debug("SCAN step 5: embedding shape=%s", embedding.shape)

    # ── 6. Load stored embeddings & match ─────────────────────────────────────
    face_db = FaceDatabase(conn)
    try:
        face_data = face_db.get_all_embeddings_by_user_id()
    except Exception as exc:
        logger.error("DB error fetching embeddings: %s", exc)
        raise DatabaseError("Failed to load face embeddings from database") from exc

    total_stored = sum(len(d["embeddings"]) for d in face_data.values())
    logger.debug("SCAN step 6: loaded %d users, %d total embeddings", len(face_data), total_stored)

    if not face_data:
        logger.info("SCAN result=no_match  reason=no_registered_embeddings")
        return ScanAttendanceResponse(
            status="no_match",
            message="No registered users with face data. Please register first.",
        )

    matched_id, matched_name, score = _match_embedding(embedding, face_data)
    logger.debug(
        "SCAN step 6: best_match=%s  name=%s  score=%.4f  threshold=%.2f",
        matched_id, matched_name, score, MATCH_THRESHOLD,
    )

    if matched_id is None:
        logger.info("SCAN result=no_match  best_score=%.4f  threshold=%.2f", score, MATCH_THRESHOLD)
        return ScanAttendanceResponse(
            status="no_match",
            message="No matching registered user found.",
            confidence=round(score, 4),
        )

    # ── 7. Check existing attendance ──────────────────────────────────────────
    today = datetime.now().date().isoformat()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, time, checkout_time FROM attendance WHERE user_id = ? AND date = ?",
            (matched_id, today),
        )
        existing = cursor.fetchone()
    except sqlite3.Error as exc:
        logger.error("DB error checking existing attendance: %s", exc)
        raise DatabaseError() from exc

    if existing:
        checkin_time  = existing["time"]
        checkout_time = existing["checkout_time"]

        # Already both checked in and checked out today
        if checkout_time is not None:
            logger.info(
                "SCAN result=already_marked  user=%s  id=%d  checked_in_at=%s  checked_out_at=%s",
                matched_name, matched_id, checkin_time, checkout_time,
            )
            return ScanAttendanceResponse(
                status="already_marked",
                name=matched_name,
                time=checkin_time,
                user_id=matched_id,
                message=f"{matched_name} already completed attendance today (in: {checkin_time}, out: {checkout_time}).",
                confidence=round(score, 4),
            )

        # Checked in but not yet checked out — record checkout now
        now_time = datetime.now().strftime("%H:%M:%S")
        try:
            cursor.execute(
                "UPDATE attendance SET checkout_time = ? WHERE id = ?",
                (now_time, existing["id"]),
            )
            conn.commit()
        except sqlite3.Error as exc:
            logger.error("DB error recording checkout: %s", exc)
            raise DatabaseError("Failed to record checkout") from exc

        logger.info(
            "SCAN result=checked_out  user=%s  id=%d  checked_in_at=%s  checked_out_at=%s  confidence=%.4f",
            matched_name, matched_id, checkin_time, now_time, score,
        )
        return ScanAttendanceResponse(
            status="checked_out",
            name=matched_name,
            time=now_time,
            user_id=matched_id,
            message=f"Goodbye, {matched_name}! Checked out at {now_time}.",
            confidence=round(score, 4),
        )

    # ── 8. Record check-in ────────────────────────────────────────────────────
    mark_time = datetime.now().strftime("%H:%M:%S")
    try:
        cursor.execute(
            "INSERT INTO attendance (user_id, date, time) VALUES (?, ?, ?)",
            (matched_id, today, mark_time),
        )
        conn.commit()
    except sqlite3.Error as exc:
        logger.error("DB error inserting attendance: %s", exc)
        raise DatabaseError("Failed to record attendance") from exc

    logger.info(
        "SCAN result=marked  user=%s  id=%d  time=%s  confidence=%.4f",
        matched_name, matched_id, mark_time, score,
    )
    return ScanAttendanceResponse(
        status="marked",
        name=matched_name,
        time=mark_time,
        user_id=matched_id,
        message=f"Welcome, {matched_name}! Checked in at {mark_time}.",
        confidence=round(score, 4),
    )


@router.get("/attendance", response_model=list[AttendanceRecordResponse])
def list_attendance(
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    conn=Depends(get_connection),
):
    try:
        cursor = conn.cursor()
        base_sql = """
            SELECT attendance.id, attendance.user_id, users.name,
                   attendance.date, attendance.time, attendance.checkout_time
            FROM attendance
            JOIN users ON users.id = attendance.user_id
        """
        if date:
            cursor.execute(
                base_sql + " WHERE attendance.date = ? ORDER BY attendance.time DESC",
                (date,),
            )
        else:
            cursor.execute(base_sql + " ORDER BY attendance.date DESC, attendance.time DESC")

        rows = cursor.fetchall()
    except sqlite3.Error as exc:
        logger.error("DB error listing attendance: %s", exc)
        raise DatabaseError() from exc

    return [
        AttendanceRecordResponse(
            id=r["id"],
            user_id=r["user_id"],
            name=r["name"],
            date=r["date"],
            time=r["time"],
            checkout_time=r["checkout_time"],
        )
        for r in rows
    ]


@router.get("/stats/today", response_model=StatsTodayResponse)
def get_today_stats(conn=Depends(get_connection)):
    today = datetime.now().date().isoformat()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS total_users FROM users")
        total_users: int = cursor.fetchone()["total_users"]

        # All who checked in (regardless of checkout status)
        cursor.execute(
            "SELECT COUNT(DISTINCT user_id) AS present_users FROM attendance WHERE date = ?",
            (today,),
        )
        present_users: int = cursor.fetchone()["present_users"]

        # Checked in AND already checked out
        cursor.execute(
            """
            SELECT COUNT(DISTINCT user_id) AS checked_out_count
            FROM attendance
            WHERE date = ? AND checkout_time IS NOT NULL
            """,
            (today,),
        )
        checked_out_count: int = cursor.fetchone()["checked_out_count"]

        # Currently on premises (checked in but not yet checked out)
        currently_present: int = present_users - checked_out_count

    except sqlite3.Error as exc:
        logger.error("DB error fetching today stats: %s", exc)
        raise DatabaseError() from exc

    attendance_percent = (
        round((present_users / total_users) * 100, 2) if total_users > 0 else 0.0
    )

    return StatsTodayResponse(
        date=today,
        total_users=total_users,
        present_users=present_users,
        currently_present=currently_present,
        checked_out_count=checked_out_count,
        attendance_percent=attendance_percent,
    )


@router.get("/logs/recent")
def get_recent_scan_events():
    """Return up to 10 recent SCAN result events parsed from the log file."""
    log_path = "logs/attendance.log"
    events: list[dict] = []

    if not os.path.exists(log_path):
        return events

    line_pattern = re.compile(
        r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| \w+\s+\| api\.routes \| SCAN result=(\w+)(?:\s{2,}(.*))?$"
    )

    try:
        with open(log_path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return events

    for line in reversed(lines):
        m = line_pattern.match(line.strip())
        if not m:
            continue

        timestamp = m.group(1)
        result = m.group(2)
        rest = m.group(3) or ""

        # Parse double-space-separated key=value pairs (handles names with spaces)
        kv: dict[str, str] = {}
        for part in re.split(r"\s{2,}", rest.strip()):
            if "=" in part:
                key, _, val = part.partition("=")
                kv[key.strip()] = val.strip()

        events.append(
            {
                "timestamp": timestamp,
                "result": result,
                "user": kv.get("user"),
                "time": kv.get("checked_in_at") or kv.get("checked_out_at") or kv.get("time"),
                "checkin_time": kv.get("checked_in_at"),
                "checkout_time": kv.get("checked_out_at"),
                "confidence": float(kv["confidence"]) if "confidence" in kv else None,
                "user_id": int(kv["id"]) if kv.get("id", "").isdigit() else None,
            }
        )

        if len(events) >= 10:
            break

    return events
