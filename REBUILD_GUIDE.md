# Smart Attendance System — Complete Rebuild Guide

**Target Audience:** Teams rebuilding this backend without prior context.  
**Document Purpose:** Single source of truth for architecture, contracts, and per-file generation prompts.  
**Expected Outcome:** Exact replica of the working backend via AI-assisted code generation.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Why This System Exists](#why-this-system-exists)
3. [Core Technology Stack](#core-technology-stack)
4. [Frozen Contracts (DO NOT CHANGE)](#frozen-contracts-do-not-change)
5. [System Architecture](#system-architecture)
6. [Data Model & Database Schema](#data-model--database-schema)
7. [Face Recognition Pipeline](#face-recognition-pipeline)
8. [Business Rules & Logic](#business-rules--logic)
9. [API Contract Specification](#api-contract-specification)
10. [Frontend Responsibilities](#frontend-responsibilities)
11. [File-by-File Generation Prompts](#file-by-file-generation-prompts)
12. [Build Sequence & Checkpoints](#build-sequence--checkpoints)
13. [Validation Checklist](#validation-checklist)

---

## Project Overview

### What This System Does

This is a **Smart Attendance System (SAS)** that uses real-time face recognition to authenticate and mark attendance automatically.

Instead of manual registers, proximity cards, or PIN codes, the system verifies the actual person through face analysis. When a registered user stands in front of a webcam, the system:

1. Detects their face
2. Extracts a unique numerical fingerprint of that face (embedding)
3. Compares it against stored face fingerprints
4. Marks their attendance if a match is found above a confidence threshold

### Key User Flows

**Registration Flow:**
- User enters their name
- System captures multiple face images from webcam (5–10 samples recommended)
- Each face is processed through the pipeline (detect → align → embed)
- All embeddings are stored in the database linked to that user

**Attendance Flow:**
- User stands in front of webcam
- System captures a live frame
- Pipeline processes it: detect → align → embed
- System compares the embedding against all stored embeddings
- If a match is found above threshold (0.55 cosine similarity):
  - First scan of the day → check-in marked (attendance record created)
  - Second scan of the same day by same user → check-out marked (checkout_time updated)
  - Subsequent scans → no-op (already marked)
- If no match → "no_match" status returned

**Viewing Attendance:**
- Users can view daily attendance records
- Users can see today's stats (total present, checked out, currently present)
- System logs all scan attempts (success and failures)

---

## Why This System Exists

### Problems It Solves

1. **Proxy Attendance (Impersonation Risk):**
   - Traditional systems rely on tokens (card, PIN, phone) that can be borrowed or stolen
   - This system authenticates the person, not the token
   - Face cannot be faked without sophisticated biometric spoofing

2. **Manual Overhead:**
   - No need for manual register entries or supervisor review
   - Attendance is marked in milliseconds
   - No data entry errors

3. **Hardware Lock-In:**
   - Runs on any machine with a webcam and Python
   - No proprietary hardware required
   - Uses open-source ML models (MediaPipe, InsightFace)

4. **Privacy & Compliance:**
   - All processing happens locally on one machine
   - No data sent to the cloud
   - No external biometric service required
   - Embeddings (numbers) are stored, not photos

---

## Core Technology Stack

### Backend Runtime & Framework

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Language | Python | 3.10+ | Primary backend language |
| Web Framework | FastAPI | Latest | Async REST API framework |
| Server | Uvicorn | Latest | ASGI server runner |
| Data Validation | Pydantic | Latest | Request/response schema validation |
| Database | SQLite3 | Latest | Lightweight local relational DB |
| Utilities | python-multipart | Latest | Multipart form parsing for file uploads |

### Vision & ML Pipeline

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Face Detection | MediaPipe | Latest | Fast CPU-based face detection |
| Face Embedding | InsightFace (ArcFace) | Latest | 512-dimensional face embedding extraction |
| ONNX Runtime | onnxruntime | Latest (CPU only) | ONNX model inference engine |
| Image Processing | OpenCV (cv2) | Latest | Image decode, color conversion, cropping, resizing |
| Numerical Computing | NumPy | Latest | Vector operations, cosine similarity computation |

### Utilities & Observability

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Environment Variables | python-dotenv | Latest | Load .env configuration |
| HTTP Requests | requests | Latest | External HTTP calls (if needed) |
| Date/Time Utils | python-dateutil | Latest | Date/time parsing and formatting |
| Logging | logging (stdlib) | Latest | Structured logging with file rotation |

### Frontend (Stateless)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Markup | HTML5 | Semantic, no build step |
| Styling | CSS3 | Plain CSS, no preprocessor |
| Interactivity | Vanilla JavaScript | No framework (jQuery, React, etc.) |
| Video Capture | WebRTC (browser API) | getUserMedia() for camera access |
| Backend Communication | Fetch API | Vanilla JS, no libraries |

### Deployment Environment

- **OS:** Linux (primary), macOS, or Windows with WSL
- **Execution:** Single machine, single terminal
- **Dependencies:** Python installed, pip available, system Python 3.10+
- **Hardware:** CPU only (no GPU required or used)
- **Network:** Localhost (127.0.0.1) only, CORS enabled for testing

---

## Frozen Contracts (DO NOT CHANGE)

These values and names are **hardcoded across the system**. Changing them will break integration.

### API Routes (Exact Paths)

```
GET  /api/health
POST /api/users
GET  /api/users
DELETE /api/users/{user_id}
POST /api/attendance/mark
POST /api/attendance/scan
GET  /api/attendance
GET  /api/stats/today
GET  /api/logs/recent
```

### Scan Status Values

These exact strings are used to represent scan outcomes. Any UI, logging, or validation logic that checks status must use these:

```
"marked"         → Attendance was successfully recorded (check-in or check-out)
"already_marked" → Attendance already recorded today for this user (no action taken)
"no_face"        → No face detected in the image
"no_match"       → Face detected but no stored embedding matched above threshold
```

### Database Table Names

```
users
face_embeddings
attendance
```

### Database Column Names

**users table:**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL)
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

**face_embeddings table:**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER, foreign key to users)
- `embedding` (BLOB — stored as float32 bytes)

**attendance table:**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER, foreign key to users)
- `date` (TEXT — format YYYY-MM-DD)
- `time` (TEXT — format HH:MM:SS, check-in time)
- `checkout_time` (TEXT — format HH:MM:SS or NULL)

### Vision Pipeline Constants

| Constant | Value | Where Used | Purpose |
|----------|-------|-----------|---------|
| Face Detection Confidence Threshold | 0.5 | detector.py | MediaPipe minimum confidence |
| Face Embedding Dimension | 512 | embedder.py | ArcFace output vector size |
| Face Alignment Target Size | 112x112 pixels | aligner.py | ArcFace input requirement |
| Match Threshold (Cosine Similarity) | 0.55 | routes.py | Minimum similarity to accept a match |
| Face Detection Input Size | 640x640 | server.py / embedder.py | InsightFace detection resolution |

### HTTP Status Codes (Exact)

```
200 OK          → Successful GET, POST, or scan that works
201 CREATED     → POST /api/users successful (user registration)
400 BAD REQUEST → Invalid image data (base64 decode fails, image too small, etc.)
422 UNPROCESSABLE ENTITY → Image is valid but embedding extraction failed
503 SERVICE UNAVAILABLE → Face recognition model is not ready (startup not complete)
500 INTERNAL SERVER ERROR → Unexpected error (logged)
```

### Pydantic Model Field Names (Used in JSON)

All JSON request/response bodies must use these exact field names:

**CreateUserRequest:**
- `name` (str, required, 1–120 chars)
- `images` (list of str, optional, base64-encoded JPEG images)

**UserResponse:**
- `id` (int)
- `name` (str)
- `created_at` (str, ISO format)

**CreateUserResponse:**
- `id` (int)
- `name` (str)
- `created_at` (str)
- `embeddings_stored` (int)
- `embeddings_failed` (int)

**ScanAttendanceRequest:**
- `image` (str, required, base64-encoded JPEG)

**ScanAttendanceResponse:**
- `status` (str, one of: marked, already_marked, no_face, no_match)
- `message` (str, optional details)
- `name` (str or null, user name if matched)
- `time` (str or null, check-in/check-out time if marked)
- `user_id` (int or null, matched user ID)
- `confidence` (float or null, cosine similarity score)

**AttendanceRecordResponse:**
- `id` (int)
- `user_id` (int)
- `name` (str)
- `date` (str, YYYY-MM-DD)
- `time` (str, HH:MM:SS, check-in time)
- `checkout_time` (str or null, HH:MM:SS or null)

**StatsTodayResponse:**
- `date` (str, YYYY-MM-DD)
- `total_users` (int, total registered)
- `present_users` (int, checked in today)
- `currently_present` (int, checked in but not checked out)
- `checked_out_count` (int, checked in and checked out)
- `attendance_percent` (float, 0–100)

### Required Python Class Names & Methods

These are referenced by imports and must not be renamed:

**database/models.py:**
- Class: `FaceDatabase`
- Methods: `create_tables()`, `add_user(name)`, `add_embedding(user_id, embedding)`, `get_all_embeddings()`, `get_all_embeddings_by_user_id()`, `get_user_id(name)`

**attendance/attendance_service.py:**
- Class: `AttendanceService`
- Methods: `has_attended_today(user_id)`, `mark_attendance(user_id)`, `get_today_record(user_id)`, `mark_checkout(user_id)`

**vision/detector.py:**
- Class: `FaceDetector`
- Method: `detect_faces(frame)` → returns list of [x1, y1, x2, y2] boxes

**vision/aligner.py:**
- Class: `FaceAligner`
- Method: `align_face(frame, bbox)` → returns 112x112 aligned face or None

**vision/embedder.py:**
- Class: `FaceEmbedder`
- Methods: `_ensure_model_loaded()`, `get_embedding(face_image)` → returns 512-d np.ndarray or None

**api/errors.py:**
- Base Class: `AppError`
- Subclasses: `ImageDecodeError`, `ModelNotReadyError`, `EmbeddingError`, `DatabaseError`

**api/routes.py:**
- Router: `router` (APIRouter instance, includes all endpoints)
- Functions: `init_database()`, `get_connection()`, `decode_base64_image()`, `_extract_embedding_from_frame()`

**api/server.py:**
- App: `app` (FastAPI instance)
- Lifecycle: `lifespan()` context manager

---

## System Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Frontend)                       │
│  HTML + CSS + Vanilla JS + WebRTC (Camera Capture)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    HTTP/JSON (Fetch API)
                           │
            ┌──────────────▼───────────────────┐
            │   FastAPI Backend (uvicorn)      │
            │   api/server.py                  │
            │   - CORS enabled                 │
            │   - Exception handlers           │
            │   - Lifespan (startup/shutdown)  │
            └──────────────┬────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   [Routes]          [Vision Pipeline]   [Database]
        │                  │                  │
   api/routes.py      detector.py       models.py
   - /health          aligner.py        SQLite3
   - /users           embedder.py       attendance.db
   - /attendance      ↓
   - /stats           Detection → Alignment → Embedding
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
            ┌──────────────▼───────────────────┐
            │      Attendance Service          │
            │   attendance_service.py          │
            │   - has_attended_today()         │
            │   - mark_attendance()            │
            │   - mark_checkout()              │
            └──────────────────────────────────┘
```

### Request-to-Response Lifecycle

#### Scan Endpoint (`POST /api/attendance/scan`)

```
1. Frontend captures base64 image from webcam
2. POST to /api/attendance/scan with base64 in JSON
3. Backend receives request
4. Decode base64 → OpenCV BGR frame
5. Run vision pipeline:
   a. Detector.detect_faces(frame) → list of boxes or empty
   b. If no boxes → return {status: "no_face"}
   c. Pick largest box (usually the person closest to camera)
   d. Aligner.align_face(frame, box) → 112x112 face or None
   e. If None → return {status: "no_face"}
   f. Embedder.get_embedding(face) → 512-d vector or None
   g. If None → return {status: "no_match"} (recovery from pipeline failure)
6. Match embedding against database:
   a. Load all stored embeddings keyed by user_id
   b. Compute cosine similarity between query and each stored embedding
   c. Track best match (highest similarity)
   d. If best_score >= 0.55 → match found, else → no match
7. If match found:
   a. Load AttendanceService with SQLite connection
   b. Check: has_attended_today(user_id)?
   c. If yes → return {status: "already_marked"}
   d. If no → mark_attendance(user_id) → check-in recorded
   e. Return {status: "marked", name, time, user_id, confidence}
8. If no match → return {status: "no_match", confidence}
9. Log scan attempt with timestamp
10. Return response JSON to frontend
```

#### Register Endpoint (`POST /api/users`)

```
1. Frontend captures 5–10 base64 images
2. POST to /api/users with {name, images: [list of base64]}
3. Backend receives request
4. Validate name length (1–120 chars)
5. Create user in database → user_id
6. For each image in the list:
   a. Decode base64 → frame
   b. Run full pipeline (detect → align → embed)
   c. If successful, store embedding with user_id
   d. If failed, skip and track failure count
7. Return {id, name, created_at, embeddings_stored, embeddings_failed}
```

### Error Handling & Recovery

**Image Decode Errors (400 Bad Request):**
- Empty base64 string
- Invalid base64 encoding
- Decoded bytes cannot be parsed as image
- Image smaller than 10×10 pixels
- → Return ImageDecodeError with descriptive message

**Embedding Pipeline Errors (422 Unprocessable Entity):**
- Face detection runs but fails (rare)
- Face alignment crops invalid region (returns None gracefully)
- Embedding extraction fails or returns None
- → Log error, return EmbeddingError or no_match status

**Model Not Ready (503 Service Unavailable):**
- API started but FaceAnalysis model not yet downloaded/initialized
- → Return ModelNotReadyError with descriptive message
- Note: Does not block API startup; other endpoints (health, /users GET, etc.) still work

**Database Errors (500 Internal Server Error):**
- SQLite connection fails
- Corrupted blob in database (handled gracefully by skipping row)
- → Log error, return DatabaseError

---

## Data Model & Database Schema

### Database Initialization

SQLite database file: `attendance.db` (created automatically on first run)

Database initialization happens in `api/routes.py` function `init_database()`, called during FastAPI startup (lifespan).

Schema is created idempotently using `CREATE TABLE IF NOT EXISTS`, so re-running does not error.

### Schema Definitions

#### Table: `users`

Purpose: Store registered user profiles.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-generated user ID |
| name | TEXT | NOT NULL | User display name, may not be unique |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |

Example row:
```
id=1, name="Alice", created_at="2026-04-24 10:30:15"
```

#### Table: `face_embeddings`

Purpose: Store numerical face fingerprints linked to users.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-generated embedding ID |
| user_id | INTEGER | FOREIGN KEY (users.id) | Link to user |
| embedding | BLOB | NOT NULL | 512-dimensional float32 vector stored as 2048 bytes |

Storage format:
- Embedding is a 512-element float32 NumPy array
- Stored as raw bytes via `.astype(np.float32).tobytes()`
- Retrieved via `np.frombuffer(blob, dtype=np.float32)`
- Size: 512 floats × 4 bytes/float = 2048 bytes per row

Example operation:
```python
# Store
embedding = np.array([0.5, -0.3, ...512 values...], dtype=np.float32)
blob = embedding.tobytes()
cursor.execute("INSERT INTO face_embeddings (user_id, embedding) VALUES (?, ?)", (user_id, blob))

# Retrieve
cursor.execute("SELECT embedding FROM face_embeddings WHERE id = 1")
row = cursor.fetchone()
embedding = np.frombuffer(row["embedding"], dtype=np.float32)
```

#### Table: `attendance`

Purpose: Record attendance check-in and check-out events.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-generated record ID |
| user_id | INTEGER | FOREIGN KEY (users.id) | Link to user |
| date | TEXT | NOT NULL | Date in YYYY-MM-DD format |
| time | TEXT | NOT NULL | Check-in time in HH:MM:SS format |
| checkout_time | TEXT | NULL | Check-out time in HH:MM:SS format, initially NULL |

Business rule: One attendance record per user per date (enforced at application level, not DB constraint).

Example rows:
```
id=1, user_id=1, date="2026-04-24", time="09:15:30", checkout_time=NULL       → Checked in, not checked out
id=2, user_id=1, date="2026-04-23", time="09:10:00", checkout_time="17:45:20" → Checked in and out
```

### Database Migrations

When the database is opened or recreated, the FaceDatabase class automatically handles schema upgrades.

Migration logic:
```
1. Create users table (safe, idempotent)
2. Create face_embeddings table (safe, idempotent)
3. Create attendance table (safe, idempotent)
4. Try to add checkout_time column to attendance:
   - If column already exists → exception caught, pass (column is already there)
   - If column does not exist → alter table adds it
   - This allows old databases to be upgraded without data loss
```

### Querying Patterns

**All embeddings by user ID (for scanning):**
```python
db.get_all_embeddings_by_user_id()
# Returns: {user_id: {"name": str, "embeddings": [np.ndarray, ...]}, ...}
```

**Check if user attended today:**
```python
service.has_attended_today(user_id)
# Returns: bool
```

**Mark check-in:**
```python
success = service.mark_attendance(user_id)
# Returns: True if inserted, False if already attended today
```

**Mark check-out:**
```python
checkout_time_str = service.mark_checkout(user_id)
# Returns: "HH:MM:SS" if updated, None if not applicable
```

---

## Face Recognition Pipeline

### Overview

The face recognition pipeline converts a webcam frame into a numerical embedding that uniquely represents a person's face. The pipeline has three stages:

1. **Detection:** Find face bounding boxes in the image
2. **Alignment:** Crop and normalize the face to a standard size (112×112)
3. **Embedding:** Extract a 512-dimensional numerical fingerprint

### Stage 1: Detection

**Tool:** MediaPipe (BlazeFace model)

**Input:** OpenCV BGR frame (H×W×3 uint8 array)

**Output:** List of bounding boxes, each as [x1, y1, x2, y2] (pixel coordinates)

**Process:**
1. Convert frame from BGR to RGB (MediaPipe requirement)
2. Run MediaPipe FaceDetection with min_detection_confidence=0.5
3. For each detected face, extract relative bounding box (0–1 normalized coords)
4. Convert relative coords to pixel coords based on frame dimensions
5. Return list of [x1, y1, x2, y2]

**Failure modes:**
- No face in frame → return empty list
- Multiple faces in frame → return all boxes; routing layer picks largest

**Implementation file:** `vision/detector.py`

**Class:** `FaceDetector`

**Method:** `detect_faces(frame) → list[list[int]]`

### Stage 2: Alignment

**Tool:** OpenCV

**Input:** Original frame (BGR) + bounding box [x1, y1, x2, y2]

**Output:** Cropped and resized 112×112 face image (BGR uint8)

**Process:**
1. Extract bounding box coordinates and clamp to frame bounds (prevent negative indices)
2. Crop region: `frame[y1:y2, x1:x2]`
3. Resize to 112×112 using cv2.INTER_LINEAR (OpenCV default)
4. Return resized face

**Why 112×112?**
- ArcFace model is trained on this exact input size
- Smaller than original face region (loss of detail is acceptable)
- Fast to process

**Failure modes:**
- Bounding box is invalid (e.g., off-image) → cropped region is empty → return None
- Cropping succeeds but results in < 1×1 pixel → skip silently

**Implementation file:** `vision/aligner.py`

**Class:** `FaceAligner`

**Method:** `align_face(frame, bbox) → np.ndarray or None`

### Stage 3: Embedding

**Tool:** InsightFace (ArcFace recognition model)

**Input:** Aligned 112×112 face image (BGR uint8)

**Output:** 512-dimensional numpy float32 array (normalized)

**Model Details:**
- Model pack: `buffalo_l` (contains detection and recognition models)
- Recognition model: ArcFace (trained on large face datasets)
- Execution: CPU only (ONNX Runtime CPU provider)
- Auto-download: Happens on first run; stored in ~/.insightface/models/

**Process:**
1. On first call: lazy-load FaceAnalysis and extraction model
2. Ensure input is exactly 112×112
3. Convert HWC → CHW (transpose from (112, 112, 3) to (3, 112, 112))
4. Add batch dimension: (1, 3, 112, 112)
5. Call model forward pass with float32 input
6. Extract output embedding
7. Return as 1D float32 array

**Error handling:**
- If model fails to load → log error, return None (not fatal)
- If embedding extraction fails → log error, return None (scan continues with "no_match")
- If model returns empty or wrong shape → validate and return None

**Failure modes:**
- Model not yet downloaded (first startup) → lazy-load on first request
- Model download fails → server starts but returns 503 ModelNotReadyError on scan attempts
- Face too blurry or unusual angle → embedding extracted but may be low quality (not detected by system)

**Implementation file:** `vision/embedder.py`

**Class:** `FaceEmbedder`

**Methods:**
- `_ensure_model_loaded() → None` (lazy initialization)
- `get_embedding(face_image) → np.ndarray or None`

### Matching (Post-Pipeline)

**After embedding extraction, the routing layer matches against stored embeddings.**

**Algorithm: Cosine Similarity**

```
similarity(A, B) = (A · B) / (||A|| × ||B||)
Range: -1 to +1 (typically 0.4 to 1.0 for faces)
Threshold: 0.55 (hardcoded)
```

**Match Logic:**
1. Query embedding extracted from scan frame
2. Load all stored embeddings from database (grouped by user_id)
3. For each stored embedding:
   - Compute cosine_similarity(query, stored)
   - Track best match (highest score, best_id, best_name)
4. If best_score >= 0.55:
   - Return match (user_id, name, confidence)
5. Else:
   - Return no match (None, None, best_score)

**Why 0.55?**
- Empirically chosen balance between false positives and false negatives
- 0.55 typically means ~95% match confidence for ArcFace
- Can be tuned per deployment (lives in routes.py as `MATCH_THRESHOLD`)

---

## Business Rules & Logic

### Rule 1: One Check-In Per User Per Day

**Rule:** A user can mark check-in only once per day.

**Implementation:**
1. On successful scan match, before marking attendance, check: `has_attended_today(user_id)`
2. If True → return {status: "already_marked", message: "Already marked today"}
3. If False → insert new attendance record

**Rationale:** Prevents duplicate check-ins from accidental double scans or system misuse.

### Rule 2: Check-In to Check-Out Transition

**Rule:** After checking in, the same user's next successful scan on the same day marks check-out.

**Implementation:**
1. On successful scan match (first scan of day):
   - `mark_attendance(user_id)` → inserts row with checkout_time=NULL
   - Return {status: "marked", time: check_in_time, user_id, ...}
2. On successful scan match (second scan of day, same user):
   - `has_attended_today(user_id)` → True (row exists)
   - Return {status: "already_marked"} (not checkout)

**Note:** Current implementation does NOT automatically mark checkout. Checkout marking requires a separate flow or manual action. See API section for details.

**Rationale:** Prevents false check-outs from noise or random faces.

### Rule 3: Time Format Standards

**Rule:** All times in database and API responses use ISO 8601 subset.

**Date format:** YYYY-MM-DD (e.g., "2026-04-24")

**Time format:** HH:MM:SS in 24-hour (e.g., "09:15:30")

**Implementation:**
```python
from datetime import datetime
today = datetime.now().date().isoformat()  # "2026-04-24"
now_time = datetime.now().time().strftime("%H:%M:%S")  # "09:15:30"
```

### Rule 4: Best-Match Selection

**Rule:** If multiple faces are detected in one frame, the largest face (by bounding box area) is processed.

**Rationale:** Assumes the person closest to camera (largest bounding box) is the intended user.

**Implementation:**
```python
def _pick_largest_box(boxes):
    return max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
```

### Rule 5: Match Confidence Threshold

**Rule:** A scan is accepted as a match only if cosine similarity >= 0.55.

**Rationale:** Empirical threshold balancing false acceptance rate (FAR) and false rejection rate (FRR).

**Implementation:** Hardcoded in `routes.py` as `MATCH_THRESHOLD = 0.55`

### Rule 6: Image Size Validation

**Rule:** Image must be at least 10×10 pixels to be processable.

**Rationale:** Prevents processing of tiny, meaningless images.

**Implementation:**
```python
h, w = frame.shape[:2]
if h < 10 or w < 10:
    raise ImageDecodeError("Image is too small")
```

### Rule 7: No Face in Frame

**Rule:** If no face is detected in a frame, return {status: "no_face"} without attempting embedding.

**Rationale:** Avoids wasting CPU on processing non-face images.

**Implementation:**
```python
if not boxes:
    return ScanAttendanceResponse(status="no_face")
```

### Rule 8: Pipeline Failure Handling

**Rule:** If any stage of the pipeline (detect, align, embed) fails unexpectedly, the scan is treated as no_match, not as an error.

**Rationale:** Graceful degradation; system remains responsive even if intermediate stages have issues.

**Implementation:** Each stage returns None on failure; routing layer treats None as no_match.

---

## API Contract Specification

### Base URL

```
http://127.0.0.1:8000/api
```

### Authentication

No authentication required (all endpoints are public).

### Content-Type

All requests and responses are `application/json`.

### Error Response Format

All errors follow this structure:

```json
{
  "error": "Human-readable error message",
  "type": "ErrorClassName"
}
```

Example:
```json
{
  "error": "Could not decode the provided image",
  "type": "ImageDecodeError"
}
```

---

### Endpoint 1: Health Check

**Route:** `GET /api/health`

**Purpose:** Verify server is running and model is ready.

**Request:** None (no body)

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "smart-attendance-api",
  "model_ready": true
}
```

**Response (200 OK, model not yet initialized):**
```json
{
  "status": "ok",
  "service": "smart-attendance-api",
  "model_ready": false
}
```

**Use Case:** Frontend polls this on startup to determine if /api/attendance/scan is available.

---

### Endpoint 2: Create User (Register)

**Route:** `POST /api/users`

**Purpose:** Register a new user with face samples.

**Request:**
```json
{
  "name": "Alice",
  "images": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABA...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABA...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABA..."
  ]
}
```

**Field Details:**
- `name` (string, required): 1–120 characters, user's display name
- `images` (array of strings, optional): Base64-encoded JPEG images
  - Can include data-URI prefix (`data:image/jpeg;base64,`) or raw base64
  - Recommended: 5–10 images for good model coverage

**Response (201 Created):**
```json
{
  "id": 1,
  "name": "Alice",
  "created_at": "2026-04-24T10:30:15",
  "embeddings_stored": 8,
  "embeddings_failed": 0
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Name must be between 1 and 120 characters",
  "type": "ValidationError"
}
```

**Response (400 Bad Request, image decode fails):**
```json
{
  "error": "Could not decode the provided image",
  "type": "ImageDecodeError"
}
```

**Response (422 Unprocessable Entity, pipeline failure):**
```json
{
  "error": "Could not extract face embedding from the image",
  "type": "EmbeddingError"
}
```

**Use Case:** Frontend registration page collects name and 5–10 face samples, sends to this endpoint.

---

### Endpoint 3: List Users

**Route:** `GET /api/users`

**Purpose:** Retrieve all registered users.

**Request:** None

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Alice",
    "created_at": "2026-04-24T10:30:15"
  },
  {
    "id": 2,
    "name": "Bob",
    "created_at": "2026-04-24T10:45:00"
  }
]
```

**Empty response (200 OK):**
```json
[]
```

**Use Case:** Frontend lists all registered users for reference or deletion.

---

### Endpoint 4: Delete User

**Route:** `DELETE /api/users/{user_id}`

**Purpose:** Remove a user and all associated embeddings and attendance records.

**Request:** None

**Path Parameter:**
- `user_id` (integer): ID of the user to delete

**Response (200 OK):**
```json
{
  "message": "User deleted successfully"
}
```

**Response (404 Not Found):**
```json
{
  "error": "User not found",
  "type": "DatabaseError"
}
```

**Use Case:** Admin removes a user from the system.

---

### Endpoint 5: Scan for Attendance

**Route:** `POST /api/attendance/scan`

**Purpose:** Process a webcam frame for attendance matching.

**Request:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABA..."
}
```

**Field Details:**
- `image` (string, required): Base64-encoded JPEG frame
  - Can include `data:image/jpeg;base64,` prefix or raw base64
  - Typically 640×480 or 1280×720 from browser WebRTC

**Response (200 OK, check-in marked):**
```json
{
  "status": "marked",
  "message": "",
  "name": "Alice",
  "time": "09:15:30",
  "user_id": 1,
  "confidence": 0.87
}
```

**Response (200 OK, already marked):**
```json
{
  "status": "already_marked",
  "message": "Attendance already marked today for Alice",
  "name": "Alice",
  "time": null,
  "user_id": 1,
  "confidence": null
}
```

**Response (200 OK, no face):**
```json
{
  "status": "no_face",
  "message": "No face detected in the frame",
  "name": null,
  "time": null,
  "user_id": null,
  "confidence": null
}
```

**Response (200 OK, no match):**
```json
{
  "status": "no_match",
  "message": "Face detected but no matching registered user",
  "name": null,
  "time": null,
  "user_id": null,
  "confidence": 0.42
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Could not decode the provided image",
  "type": "ImageDecodeError"
}
```

**Response (422 Unprocessable Entity):**
```json
{
  "error": "Could not extract face embedding from the image",
  "type": "EmbeddingError"
}
```

**Response (503 Service Unavailable):**
```json
{
  "error": "Face recognition model is not available. The server may still be loading or the model failed to initialise.",
  "type": "ModelNotReadyError"
}
```

**Use Case:** Frontend captures webcam frame and sends to this endpoint on every scan button click.

---

### Endpoint 6: Mark Attendance Manually

**Route:** `POST /api/attendance/mark`

**Purpose:** Manually mark attendance for a user (used rarely, mostly for admin/makeup).

**Request:**
```json
{
  "user_id": 1
}
```

**Response (200 OK):**
```json
{
  "message": "Attendance marked successfully",
  "time": "09:15:30",
  "date": "2026-04-24"
}
```

**Response (409 Conflict, already marked):**
```json
{
  "error": "Attendance already marked for today",
  "type": "ValidationError"
}
```

**Response (404 Not Found):**
```json
{
  "error": "User not found",
  "type": "DatabaseError"
}
```

**Use Case:** Admin manually records attendance for a registered user.

---

### Endpoint 7: Get Attendance Records

**Route:** `GET /api/attendance`

**Purpose:** Retrieve all attendance records (optionally filtered by date or user).

**Query Parameters (optional):**
- `date` (string): YYYY-MM-DD format, filters to specific date
- `user_id` (integer): Filters to specific user

**Request Examples:**
```
GET /api/attendance
GET /api/attendance?date=2026-04-24
GET /api/attendance?user_id=1
GET /api/attendance?date=2026-04-24&user_id=1
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "Alice",
    "date": "2026-04-24",
    "time": "09:15:30",
    "checkout_time": null
  },
  {
    "id": 2,
    "user_id": 2,
    "name": "Bob",
    "date": "2026-04-24",
    "time": "09:20:00",
    "checkout_time": "17:45:15"
  }
]
```

**Empty response (200 OK):**
```json
[]
```

**Use Case:** Frontend attendance page displays historical records.

---

### Endpoint 8: Get Today's Stats

**Route:** `GET /api/stats/today`

**Purpose:** Retrieve attendance statistics for today.

**Request:** None

**Response (200 OK):**
```json
{
  "date": "2026-04-24",
  "total_users": 10,
  "present_users": 7,
  "currently_present": 5,
  "checked_out_count": 2,
  "attendance_percent": 70.0
}
```

**Field Meanings:**
- `date`: Today's date (YYYY-MM-DD)
- `total_users`: Total registered users in database
- `present_users`: Users who have checked in today (includes those who also checked out)
- `currently_present`: Users checked in but NOT checked out (checkout_time IS NULL)
- `checked_out_count`: Users who have both checked in and checked out today
- `attendance_percent`: (present_users / total_users) × 100

**Use Case:** Frontend stats page displays today's overview.

---

### Endpoint 9: Get Recent Logs

**Route:** `GET /api/logs/recent`

**Purpose:** Retrieve recent scan attempts for debugging.

**Query Parameters (optional):**
- `limit` (integer, default 50): Number of recent logs to return

**Request Example:**
```
GET /api/logs/recent
GET /api/logs/recent?limit=100
```

**Response (200 OK):**
```json
[
  {
    "timestamp": "2026-04-24 10:15:30",
    "status": "marked",
    "user_id": 1,
    "name": "Alice",
    "confidence": 0.87
  },
  {
    "timestamp": "2026-04-24 10:15:15",
    "status": "no_face",
    "user_id": null,
    "name": null,
    "confidence": null
  }
]
```

**Use Case:** Frontend debug/logs page displays recent scan activity.

---

## Frontend Responsibilities

### Frontend Architecture

The frontend is a stateless, multi-page HTML + CSS + Vanilla JS application. No build step, no framework, runs directly in browser.

**Pages:**
1. `index.html` — Home/landing page
2. `register.html` — User registration (capture face samples)
3. `scan.html` — Live attendance scanning
4. `attendance.html` — View attendance records
5. `stats.html` — View today's statistics

**Shared Utilities:**
- `api.js` — API wrapper functions (centralized HTTP calls)
- `app.js` — Shared utilities (date formatting, error handling, etc.)
- `styles.css` — Global styling (responsive, dark/light mode optional)

### Common Frontend Patterns

**Loading & Error Display:**
- Show loading spinner during API calls
- Display error messages prominently
- Disable buttons while request is in-flight

**Camera Access:**
- Request `navigator.mediaDevices.getUserMedia()` permission on page load
- Stream video to `<video>` element
- Capture frame via HTML `<canvas>` element when user clicks scan button
- Convert canvas to base64 JPEG

**Base64 Encoding:**
- Canvas element provides `.toDataURL("image/jpeg", 0.9)` which returns full data-URI
- OR manually encode canvas to Blob → FileReader → base64
- Include or strip `data:image/jpeg;base64,` prefix (backend handles both)

**Response Handling:**
- Parse JSON response from API
- Update UI based on `status` field (marked, already_marked, no_face, no_match)
- Display user name and time on successful match
- Display confidence score if available
- Show error message if HTTP status >= 400

**Session State:**
- No login required
- Store nothing persistent except browser cache
- Refresh page clears all transient state

### Frontend File Details

**api.js:**
- Centralized API wrapper functions
- Example functions:
  - `async function registerUser(name, imageList)`
  - `async function scanFrame(base64Image)`
  - `async function getAttendance(filters?)`
  - `async function getStats()`
  - `async function deleteUser(userId)`
  - `async function listUsers()`
- Error handling: Convert HTTP errors to user-friendly messages

**app.js:**
- Shared utility functions
- Example functions:
  - `formatDate(isoString)` → human-readable date
  - `formatTime(timeString)` → human-readable time
  - `displayError(message)` → show error toast/modal
  - `displaySuccess(message)` → show success toast/modal
  - `getQueryParam(key)` → read URL query string
  - `base64ToBlob(base64Str)` → convert base64 to Blob (if needed)

**styles.css:**
- Responsive layout (mobile-first)
- Colors and typography
- Form styling (inputs, buttons)
- Modal/toast styling
- Video element styling
- Table styling for attendance/stats

**register.html:**
- User name input field (text)
- "Start Camera" button
- Video preview element showing live camera feed
- "Capture Sample" button (captures current frame, stores locally in memory)
- Counter showing samples captured (e.g., "5 / 10")
- "Register User" button (sends all samples to backend)
- Status messages (loading, success, error)

**scan.html:**
- Live video preview
- "Scan" button
- Scan result display (status, name, time, confidence)
- Recent scan history (last 10 scans)
- "Go to Attendance" and "Go to Stats" links

**attendance.html:**
- Table showing all attendance records (with pagination optional)
- Filters: date range, user name
- Columns: user name, date, check-in time, check-out time
- "Export to CSV" button (optional)

**stats.html:**
- Today's stats display (cards or dashboard)
- Total users, present users, currently present, checked out
- Attendance percentage (progress bar)
- Refresh button (polls /api/stats/today every 5 seconds)

---

## File-by-File Generation Prompts

### Global Prompt Preamble

Before generating any file, prepend this to the ChatGPT prompt to establish context and expectations:

```
You are a senior software engineer with 20+ years of experience in Python, JavaScript, web frameworks, and database design.

Your task is to generate one complete file based on the specifications below.

Important constraints:
1. Return ONLY the file content. No explanations, markdown fences, or comments outside the code.
2. Do not add code comments unless specifically requested.
3. Keep all function names, class names, import paths, and constants exactly as specified.
4. The generated code must be directly runnable (no syntax errors, all imports valid).
5. Follow the code style: PEP 8 for Python, simple and readable for JavaScript.
6. Do NOT generate test files, documentation, or configuration files.

Your output will be saved to a file path and run immediately, so correctness is critical.

If any detail is unclear, infer the most reasonable implementation based on the given specifications.
```

---

### File 1: requirements.txt

**File Path:** `requirements.txt` (project root)

**Purpose:** Define all Python dependencies with version constraints for reproducibility.

**Prompt to feed to ChatGPT:**

```
You are a senior software engineer with 20+ years of experience in Python, web frameworks, and machine learning.

Your task is to generate one complete file based on the specifications below.

Important constraints:
1. Return ONLY the file content. No explanations, markdown fences, or comments outside the code.
2. Do not add code comments.
3. Must be directly runnable.

Generate the file: requirements.txt

Purpose: Python dependencies for a face-recognition-based attendance system running on CPU only, using FastAPI, MediaPipe, InsightFace, OpenCV, SQLite, and Pydantic.

Requirements:
1. FastAPI (latest stable, for REST API)
2. Uvicorn with standard extras (for ASGI server)
3. Pydantic (request/response validation)
4. Python-multipart (multipart form data)
5. OpenCV (cv2) — for image processing
6. MediaPipe (for face detection)
7. InsightFace (for ArcFace face embeddings)
8. ONNX Runtime (CPU provider only, no GPU)
9. NumPy (numerical operations)
10. Requests (HTTP requests)
11. Python-dateutil (date/time parsing)
12. Python-dotenv (environment variables)

Each dependency on one line with bounded version range (e.g., >=1.0,<2.0 to prevent breaking changes).
Use conservative versions (prefer mature releases).
Target Python 3.10+.
CPU-only execution (no CUDA or GPU dependencies).

Return only the content of requirements.txt, nothing else.
```

---

### File 2: database/models.py

**File Path:** `database/models.py`

**Purpose:** SQLite schema definition and low-level database operations.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in database design and Python.

Your task is to generate the file: database/models.py

Purpose: Define SQLite schema and database operations for a face recognition attendance system.

Requirements:

1. Class name: FaceDatabase
2. Constructor: __init__(self, connection)
   - Takes a sqlite3 connection object (passed in, not created here)
   - Calls self.create_tables() during initialization

3. Method: create_tables(self)
   - Creates these three tables (idempotent, safe to call multiple times):
     a) users table:
        - id INTEGER PRIMARY KEY AUTOINCREMENT
        - name TEXT NOT NULL
        - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     b) face_embeddings table:
        - id INTEGER PRIMARY KEY AUTOINCREMENT
        - user_id INTEGER FOREIGN KEY to users.id
        - embedding BLOB (stores float32 vector as bytes)
     c) attendance table:
        - id INTEGER PRIMARY KEY AUTOINCREMENT
        - user_id INTEGER FOREIGN KEY to users.id
        - date TEXT (YYYY-MM-DD format)
        - time TEXT (HH:MM:SS format, check-in time)
        - checkout_time TEXT (HH:MM:SS format or NULL)
   - Include migration logic: try to ALTER TABLE attendance ADD COLUMN checkout_time TEXT
     If column already exists (exception), pass silently (safe migration for old databases)

4. Method: add_user(self, name)
   - INSERT INTO users (name) VALUES (?)
   - COMMIT
   - Return the lastrowid (new user's ID)

5. Method: add_embedding(self, user_id, embedding)
   - Convert embedding (numpy float32 array) to bytes: embedding.astype(np.float32).tobytes()
   - INSERT INTO face_embeddings (user_id, embedding) VALUES (?, ?)
   - COMMIT

6. Method: get_all_embeddings(self)
   - SELECT users.name, face_embeddings.embedding FROM face_embeddings JOIN users
   - Return dict: {name: [np.ndarray, ...], ...}
   - Convert BLOB back to numpy: np.frombuffer(row["embedding"], dtype=np.float32)

7. Method: get_all_embeddings_by_user_id(self)
   - SELECT users.id AS user_id, users.name, face_embeddings.embedding FROM face_embeddings JOIN users
   - Return dict: {user_id: {"name": str, "embeddings": [np.ndarray, ...]}, ...}
   - Silently skip corrupt blobs instead of raising exceptions
   - This method is used by the scan endpoint for matching

8. Method: get_user_id(self, name)
   - SELECT id FROM users WHERE name = ?
   - Return user ID (int) or None if not found

Import requirements:
- import sqlite3
- import numpy as np

Behavior notes:
- All SQL queries use ? placeholders (parameterized queries) to prevent SQL injection
- Use conn.row_factory = sqlite3.Row to enable column access by name (row["name"])
- Always call conn.commit() after INSERT/UPDATE/DELETE
- Handle errors gracefully (corrupt blobs should be skipped, not fatal)

Return only the file content, nothing else.
```

---

### File 3: attendance/attendance_service.py

**File Path:** `attendance/attendance_service.py`

**Purpose:** Business logic for check-in and check-out attendance marking.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python and business logic.

Your task is to generate the file: attendance/attendance_service.py

Purpose: Implement business logic for marking attendance (check-in and check-out).

Requirements:

1. Class name: AttendanceService
2. Constructor: __init__(self, connection)
   - Takes a sqlite3 connection object
   - Stores as self.conn

3. Method: has_attended_today(self, user_id)
   - Get today's date in YYYY-MM-DD format using datetime.now().date().isoformat()
   - SELECT * FROM attendance WHERE user_id = ? AND date = ?
   - Return True if row exists, False otherwise

4. Method: mark_attendance(self, user_id)
   - Check if user has already attended today using has_attended_today()
   - If yes, return False
   - If no:
     - Get current date/time: now = datetime.now()
     - date = now.date().isoformat() (YYYY-MM-DD)
     - time = now.time().strftime("%H:%M:%S") (HH:MM:SS)
     - INSERT INTO attendance (user_id, date, time) VALUES (?, ?, ?)
     - COMMIT
     - Return True

5. Method: get_today_record(self, user_id)
   - Get today's date in YYYY-MM-DD format
   - SELECT * FROM attendance WHERE user_id = ? AND date = ?
   - Return the row dict (or None if not found)
   - Used to check checkout_time status

6. Method: mark_checkout(self, user_id)
   - Get today's date in YYYY-MM-DD format
   - SELECT id, checkout_time FROM attendance WHERE user_id = ? AND date = ?
   - If row is None, return None (not attended yet)
   - If row exists but checkout_time is NOT NULL, return None (already checked out)
   - If row exists and checkout_time IS NULL:
     - Get current time: checkout_time = datetime.now().time().strftime("%H:%M:%S")
     - UPDATE attendance SET checkout_time = ? WHERE id = ?
     - COMMIT
     - Return the checkout_time string

Import requirements:
- from datetime import datetime

Behavior notes:
- All date/time operations use datetime module (not custom strings)
- All SQL uses ? placeholders for parameterized queries
- Always call conn.commit() after INSERT/UPDATE
- Return early if condition not met (readable, Pythonic style)

Return only the file content, nothing else.
```

---

### File 4: vision/detector.py

**File Path:** `vision/detector.py`

**Purpose:** Face detection using MediaPipe BlazeFace.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python, computer vision, and ML inference.

Your task is to generate the file: vision/detector.py

Purpose: Detect faces in images using MediaPipe BlazeFace model.

Requirements:

1. Class name: FaceDetector
2. Constructor: __init__(self, confidence=0.5)
   - confidence parameter: minimum detection confidence threshold (default 0.5)
   - Initialize MediaPipe face detection:
     self.mp_face_detection = mp.solutions.face_detection
     self.detector = self.mp_face_detection.FaceDetection(
       model_selection=0,
       min_detection_confidence=confidence
     )
   - model_selection=0 uses lightweight model (fast on CPU)

3. Method: detect_faces(self, frame)
   - Input: frame (OpenCV BGR image as numpy uint8 array H×W×3)
   - Convert BGR to RGB: rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
   - Process with MediaPipe: results = self.detector.process(rgb_frame)
   - For each detection in results.detections:
     - Extract bbox.xmin, bbox.ymin, bbox.width, bbox.height (normalized 0–1)
     - Get frame dimensions: h, w = frame.shape[:2]
     - Convert to pixel coordinates:
       x1 = int(bbox.xmin * w)
       y1 = int(bbox.ymin * h)
       x2 = int((bbox.xmin + bbox.width) * w)
       y2 = int((bbox.ymin + bbox.height) * h)
     - Append [x1, y1, x2, y2] to boxes list
   - Return boxes list (empty if no faces detected)

Import requirements:
- import cv2
- import mediapipe as mp

Behavior notes:
- If no faces detected, return empty list (not an error)
- Bounding boxes are in pixel coordinates [x1, y1, x2, y2]
- x1/y1 is top-left, x2/y2 is bottom-right
- BGR color space is OpenCV default; must convert to RGB for MediaPipe

Return only the file content, nothing else.
```

---

### File 5: vision/aligner.py

**File Path:** `vision/aligner.py`

**Purpose:** Crop and align detected faces to 112×112 size.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python and computer vision.

Your task is to generate the file: vision/aligner.py

Purpose: Align and normalize detected faces to 112×112 size for embedding extraction.

Requirements:

1. Class name: FaceAligner
2. Constructor: __init__(self, target_size=(112, 112))
   - target_size: tuple (height, width) for output face size
   - Default: (112, 112) for ArcFace compatibility
   - Store as self.target_size

3. Method: align_face(self, frame, bbox)
   - Input:
     - frame: OpenCV BGR image (numpy array H×W×3)
     - bbox: bounding box as [x1, y1, x2, y2]
   - Get frame dimensions: h, w = frame.shape[:2]
   - Unpack bbox: x1, y1, x2, y2 = bbox
   - Clamp coordinates to frame bounds (prevent out-of-bounds):
     x1 = max(0, x1)
     y1 = max(0, y1)
     x2 = min(w, x2)
     y2 = min(h, y2)
   - Check if region is valid: if (x2 - x1) <= 0 or (y2 - y1) <= 0, return None
   - Crop face: face = frame[y1:y2, x1:x2]
   - If face.size == 0, return None (empty crop)
   - Resize to target_size: aligned_face = cv2.resize(face, self.target_size)
   - Return aligned_face (numpy array 112×112×3 BGR uint8)

Import requirements:
- import cv2

Behavior notes:
- Return None on any failure (empty region, clamping results in 0-size, etc.)
- Use cv2.resize() with default interpolation (cv2.INTER_LINEAR)
- Output size is exactly self.target_size (e.g., 112×112)
- Preserve BGR color space (no conversion)

Return only the file content, nothing else.
```

---

### File 6: vision/embedder.py

**File Path:** `vision/embedder.py`

**Purpose:** Extract face embeddings using ArcFace via InsightFace.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python, ML inference, and deep learning.

Your task is to generate the file: vision/embedder.py

Purpose: Extract 512-dimensional face embeddings using ArcFace via InsightFace.

Requirements:

1. Class name: FaceEmbedder
2. Constructor: __init__(self)
   - Initialize instance variables:
     self.app = None (FaceAnalysis instance, lazy-loaded)
     self.rec_model = None (recognition model, extracted from FaceAnalysis)
     self._init_error = None (error from model loading, for retry logic)

3. Method: _ensure_model_loaded(self)
   - Check if already loaded: if self.app is not None, return early
   - Check if previous error: if self._init_error is set, raise it
   - Try to load FaceAnalysis:
     self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
     self.app.prepare(ctx_id=-1, det_size=(640, 640))
   - Extract recognition model:
     - Try hasattr(self.app, '_models') and iterate to find model with taskname == 'recognition'
     - If not found, try hasattr(self.app, 'models') dict with key 'recognition'
     - If still not found, use self.app as fallback (has built-in get_embedding method)
     - Store in self.rec_model
   - If exception occurs:
     - Store error: self._init_error = RuntimeError("Face model initialization failed: {e}")
     - Raise the error

4. Method: get_embedding(self, face_image)
   - Input: face_image (112×112 BGR uint8 numpy array, or None)
   - If face_image is None or empty, return None
   - Call self._ensure_model_loaded() to trigger lazy load
   - If exception, catch and print error, return None
   - Ensure input is 112×112: if face_image.shape[:2] != (112, 112), resize to (112, 112)
   - Prepare input for ONNX model:
     - Transpose HWC → CHW: face_chw = np.transpose(face_image, (2, 0, 1))
     - Add batch dimension: batch_input = np.expand_dims(face_chw, 0).astype(np.float32)
   - Call model forward:
     - If hasattr(self.rec_model, 'forward'): embedding = self.rec_model.forward(batch_input)
     - Elif hasattr(self.rec_model, 'get_feat'): embedding = self.rec_model.get_feat(face_image)
     - Else: print warning, return None
   - Validate embedding:
     - If None or empty, return None
     - embedding = np.asarray(embedding).squeeze()
     - If empty or not 1D, return None
   - Return embedding (1D float32 array)

Import requirements:
- import cv2
- import numpy as np
- from insightface.app import FaceAnalysis

Behavior notes:
- Lazy loading: model loads on first get_embedding() call, not __init__
- Non-fatal: errors in embedding extraction return None, do not crash
- ONNX model input format: (batch, channels, height, width) as float32
- Output: 1D float32 array of size 512 for ArcFace
- CPU-only: providers=["CPUExecutionProvider"]

Return only the file content, nothing else.
```

---

### File 7: api/errors.py

**File Path:** `api/errors.py`

**Purpose:** Custom exception classes and FastAPI error handlers.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python, FastAPI, and error handling.

Your task is to generate the file: api/errors.py

Purpose: Define custom exception hierarchy and FastAPI error handlers for the attendance API.

Requirements:

1. Base Exception Class: AppError(Exception)
   - Attributes:
     - status_code (class attribute, default 500)
     - default_message (class attribute, default "An unexpected error occurred")
   - Constructor: __init__(self, message=None)
     - If message is None, use self.default_message
     - Store as self.message
     - Call super().__init__(self.message)

2. Specific Exception Subclasses (inherit from AppError):
   a) ImageDecodeError
      - status_code = 400
      - default_message = "Could not decode the provided image"
   
   b) ModelNotReadyError
      - status_code = 503
      - default_message = "Face recognition model is not available. The server may still be loading or the model failed to initialise."
   
   c) EmbeddingError
      - status_code = 422
      - default_message = "Could not extract face embedding from the image"
   
   d) DatabaseError
      - status_code = 500
      - default_message = "A database error occurred"

3. FastAPI Exception Handler: app_error_handler(request, exc)
   - Async function: async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
   - Log the error: logger.warning("AppError [%s] on %s: %s", type(exc).__name__, request.url.path, exc.message)
   - Return JSONResponse with:
     - status_code: exc.status_code
     - content: {"error": exc.message, "type": type(exc).__name__}

4. FastAPI Catch-All Handler: unhandled_error_handler(request, exc)
   - Async function: async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
   - Log the full exception: logger.exception("Unhandled exception on %s: %s", request.url.path, exc)
   - Return JSONResponse with:
     - status_code: 500
     - content: {"error": "Internal server error", "type": "InternalError"}

Import requirements:
- import logging
- from fastapi import Request
- from fastapi.responses import JSONResponse

Behavior notes:
- logger = logging.getLogger(__name__)
- Exception handlers prevent stack traces from leaking to clients
- All AppError subclasses follow the same pattern (inherit, override class attributes)
- Handlers are registered in api/server.py using app.add_exception_handler()

Return only the file content, nothing else.
```

---

### File 8: api/routes.py

**File Path:** `api/routes.py`

**Purpose:** FastAPI route handlers and the attendance scanning pipeline.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python, FastAPI, and REST API design.

Your task is to generate the file: api/routes.py

This is a complex file with many interdependent functions. Follow the spec exactly.

Purpose: Define all API endpoints and the core attendance scanning pipeline.

Constants (define at module level):
- DB_PATH = "attendance.db"
- MATCH_THRESHOLD = 0.55 (cosine similarity threshold for face matching)

Imports needed:
- import base64, logging, os, re, sqlite3
- from datetime import datetime
- from typing import Optional
- import cv2, numpy as np
- from fastapi import APIRouter, Depends, HTTPException, Query, Request
- from pydantic import BaseModel, Field
- from api.errors import (DatabaseError, EmbeddingError, ImageDecodeError, ModelNotReadyError)
- from attendance.attendance_service import AttendanceService
- from database.models import FaceDatabase

Pydantic Models (define all of these exactly):

1. CreateUserRequest(BaseModel):
   - name: str = Field(min_length=1, max_length=120)
   - images: list[str] = Field(default_factory=list, description="Base64-encoded JPEG face images")

2. UserResponse(BaseModel):
   - id: int
   - name: str
   - created_at: str

3. CreateUserResponse(BaseModel):
   - id: int
   - name: str
   - created_at: str
   - embeddings_stored: int
   - embeddings_failed: int

4. ScanAttendanceRequest(BaseModel):
   - image: str = Field(..., description="Base64-encoded JPEG frame")

5. ScanAttendanceResponse(BaseModel):
   - status: str (one of: marked, already_marked, no_face, no_match)
   - message: str = ""
   - name: Optional[str] = None
   - time: Optional[str] = None
   - user_id: Optional[int] = None
   - confidence: Optional[float] = None

6. MarkAttendanceRequest(BaseModel):
   - user_id: int

7. AttendanceRecordResponse(BaseModel):
   - id: int
   - user_id: int
   - name: str
   - date: str
   - time: str
   - checkout_time: Optional[str] = None

8. StatsTodayResponse(BaseModel):
   - date: str
   - total_users: int
   - present_users: int
   - currently_present: int
   - checked_out_count: int
   - attendance_percent: float

Database Dependency:
```python
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
```

Helper Functions:

1. decode_base64_image(b64_str: str) -> np.ndarray
   - Strip "data:image/...;base64," prefix if present (split on ",")
   - Validate: raise ImageDecodeError if empty
   - Base64 decode with validation
   - Decode JPEG: cv2.imdecode(np.frombuffer(...), cv2.IMREAD_COLOR)
   - Validate dimensions: raise ImageDecodeError if < 10x10
   - Return BGR ndarray

2. _pick_largest_box(boxes: list[list[int]]) -> list[int]
   - Return box with max area: (x2-x1) * (y2-y1)

3. _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float
   - If norm is 0, return 0.0
   - Otherwise: return (a·b) / (||a|| * ||b||)

4. _match_embedding(query: np.ndarray, face_data: dict) -> tuple[Optional[int], Optional[str], float]
   - For each user_id in face_data:
     - For each stored embedding:
       - Compute cosine similarity
       - Track best match (highest score, best_id, best_name)
   - If best_score >= MATCH_THRESHOLD: return (best_id, best_name, best_score)
   - Else: return (None, None, best_score)

5. _extract_embedding_from_frame(frame: np.ndarray, request: Request) -> Optional[np.ndarray]
   - Get detector, aligner, embedder from request.app.state
   - Detect faces: boxes = detector.detect_faces(frame)
   - If no boxes: return None
   - Pick largest: box = _pick_largest_box(boxes)
   - Align: face = aligner.align_face(frame, box)
   - If face is None: return None
   - Embed: embedding = embedder.get_embedding(face)
   - Return embedding (may be None)

Router and Endpoints:

```python
router = APIRouter(tags=["attendance"])
logger = logging.getLogger(__name__)
```

1. GET /health
   - Get model_ready from request.app.state
   - Return {"status": "ok", "service": "smart-attendance-api", "model_ready": bool}

2. POST /users (status_code=201)
   - Input: CreateUserRequest
   - Validate name length
   - Insert user into DB
   - For each image in payload.images:
     - Decode base64 (catch ImageDecodeError)
     - Extract embedding from frame (catch EmbeddingError)
     - If successful, store embedding and increment embeddings_stored
     - If failed, increment embeddings_failed
   - Return CreateUserResponse with counts

3. GET /users
   - Query all users from DB
   - Return list[UserResponse]

4. DELETE /users/{user_id}
   - Delete user and associated embeddings from DB
   - Return {"message": "User deleted successfully"}

5. POST /attendance/scan
   - Input: ScanAttendanceRequest
   - Decode image (may raise ImageDecodeError → 400)
   - Extract embedding (may raise EmbeddingError → 422)
   - If embedding is None: return no_match status (confidence=0.0)
   - Load all embeddings from DB
   - Match: (matched_user_id, matched_name, confidence) = _match_embedding(query, db_embeddings)
   - If matched_user_id is None: return no_match status with confidence
   - If matched_user_id is not None:
     - Check has_attended_today
     - If yes: return already_marked status
     - If no: mark_attendance, return marked status with time
   - Log scan attempt

6. POST /attendance/mark
   - Input: MarkAttendanceRequest
   - Load user from DB
   - Mark attendance if not already marked
   - Return success or conflict response

7. GET /attendance
   - Optional query params: date (YYYY-MM-DD), user_id (int)
   - Query DB with filters
   - Return list[AttendanceRecordResponse]

8. GET /api/stats/today
   - Get today's date
   - Count total_users, present_users (checked in today)
   - Count currently_present (checked in but checkout_time IS NULL)
   - Count checked_out_count (checkout_time IS NOT NULL)
   - Calculate attendance_percent = (present_users / total_users) * 100 or 0 if no users
   - Return StatsTodayResponse

9. GET /api/logs/recent
   - Optional query param: limit (default 50)
   - Query recent scan logs (from logs/attendance.log)
   - Parse log lines and extract relevant fields
   - Return list of log objects

Behavior notes:
- All endpoints validate input with Pydantic
- All exceptions are caught and converted to AppError subclasses
- All responses use exact JSON field names from spec
- Status values are frozen: "marked", "already_marked", "no_face", "no_match"
- Cosine similarity threshold is hardcoded as MATCH_THRESHOLD = 0.55
- Logger is used throughout for debugging

Return only the file content, nothing else.
```

---

### File 9: api/server.py

**File Path:** `api/server.py`

**Purpose:** FastAPI app initialization, logging configuration, and lifespan management.

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in Python, FastAPI, and system design.

Your task is to generate the file: api/server.py

Purpose: FastAPI application setup, logging configuration, and application lifespan (startup/shutdown).

Imports needed:
- import logging, os
- from contextlib import asynccontextmanager
- from logging.handlers import RotatingFileHandler
- from fastapi import FastAPI
- from fastapi.middleware.cors import CORSMiddleware
- from api.errors import AppError, app_error_handler, unhandled_error_handler
- from api.routes import init_database, router

Logging Configuration (at module level):

1. Create logs directory: os.makedirs("logs", exist_ok=True)

2. Define log format:
   - fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
   - datefmt = "%Y-%m-%d %H:%M:%S"

3. Console handler:
   - StreamHandler
   - Level: INFO
   - Formatter: use the format above

4. File handler (rotating):
   - RotatingFileHandler("logs/attendance.log", maxBytes=5*1024*1024, backupCount=3, encoding="utf-8")
   - Level: DEBUG
   - Formatter: use the format above

5. Root logger:
   - setLevel(DEBUG)
   - addHandler(console)
   - addHandler(file)

6. Module logger:
   - logger = logging.getLogger(__name__)

Lifespan Context Manager:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code here (runs once at server start)
    logger.info("=" * 60)
    logger.info("Smart Attendance API — session start")
    logger.info("=" * 60)
    
    # Step 1: Initialize database
    logger.info("Initializing database schema...")
    try:
        init_database()
        logger.info("Database ready")
    except Exception as exc:
        logger.critical("Database initialisation failed: %s", exc)
        raise
    
    # Step 2 & 3: Load vision pipeline
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
        embedder._ensure_model_loaded()  # Eager load
        app.state.embedder = embedder
        app.state.model_ready = True
        logger.info("FaceEmbedder (ArcFace) ready — face scan is available")
    
    except Exception as exc:
        logger.error(
            "Vision pipeline failed to load: %s | "
            "Face-scan endpoints will return 503 until this is fixed.",
            exc,
        )
        # Attach None-safe stubs
        app.state.detector = None
        app.state.aligner = None
        app.state.embedder = None
        app.state.model_ready = False
    
    yield  # ← Application runs here
    
    # Shutdown code here (runs once at server shutdown)
    logger.info("Smart Attendance API shutting down")
```

FastAPI App Creation:

```python
app = FastAPI(
    title="Smart Attendance API",
    version="1.0.0",
    description="Face-recognition-based attendance tracking backend.",
    lifespan=lifespan,
)
```

CORS Middleware:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Exception Handlers (register in this order):

```python
# Order matters: specific handlers first
app.add_exception_handler(AppError, app_error_handler)  # type: ignore
app.add_exception_handler(Exception, unhandled_error_handler)  # type: ignore
```

Router:

```python
app.include_router(router, prefix="/api")
```

Behavior notes:
- Startup is non-blocking: if vision pipeline fails, server starts anyway and returns 503 on scan attempts
- Database initialization is critical: if it fails, server does not start (hard failure)
- Logging is configured with rotation (5MB per file, 3 backups max)
- All timestamps in logs are ISO format (YYYY-MM-DD HH:MM:SS)
- The lifespan context manager is async (using asynccontextmanager)

Return only the file content, nothing else.
```

---

### Files 10–17: Frontend Files

**Frontend files (HTML, CSS, JavaScript) are generated separately. For each one, use this pattern:**

**File: frontend/api.js**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in JavaScript, REST APIs, and frontend development.

Your task is to generate the file: frontend/api.js

Purpose: Centralized API wrapper functions for all backend communication.

Requirements:

Centralize all HTTP calls to the backend API at http://127.0.0.1:8000/api.

Implement these async functions (return Promise):

1. async registerUser(name, imageList)
   - POST /api/users
   - Payload: {name, images: imageList}
   - Return: response JSON {id, name, created_at, embeddings_stored, embeddings_failed}

2. async listUsers()
   - GET /api/users
   - Return: array of user objects

3. async deleteUser(userId)
   - DELETE /api/users/{userId}
   - Return: {message}

4. async scanFrame(base64Image)
   - POST /api/attendance/scan
   - Payload: {image: base64Image}
   - Return: response JSON {status, message, name, time, user_id, confidence}

5. async markAttendance(userId)
   - POST /api/attendance/mark
   - Payload: {user_id: userId}
   - Return: response JSON

6. async getAttendance(filters)
   - GET /api/attendance?date={date}&user_id={userId}
   - filters is optional object {date?, user_id?}
   - Return: array of attendance records

7. async getStatsToday()
   - GET /api/stats/today
   - Return: {date, total_users, present_users, currently_present, checked_out_count, attendance_percent}

8. async getRecentLogs(limit)
   - GET /api/logs/recent?limit={limit}
   - limit is optional (default 50)
   - Return: array of log objects

9. async healthCheck()
   - GET /api/health
   - Return: {status, service, model_ready}

Error Handling:
- Wrap all fetch() calls in try-catch
- If HTTP error, throw with descriptive message
- Convert fetch() Response to JSON
- Handle network errors

Behavior notes:
- Base URL is http://127.0.0.1:8000/api
- All requests are JSON Content-Type
- No authentication headers needed
- Responses may contain status="no_face" or status="no_match" — handle as success (HTTP 200) not error

Return only the file content, nothing else.
```

---

**File: frontend/app.js**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in JavaScript and frontend utilities.

Your task is to generate the file: frontend/app.js

Purpose: Shared utility functions for all frontend pages.

Implement these functions:

1. function formatDate(isoString)
   - Input: ISO format string like "2026-04-24T10:30:15"
   - Output: Human-readable string like "Apr 24, 2026"

2. function formatTime(timeString)
   - Input: HH:MM:SS like "09:15:30"
   - Output: Human-readable like "09:15 AM"

3. function displayError(message)
   - Show error message prominently (toast or modal)
   - Auto-hide after 5 seconds (optional)

4. function displaySuccess(message)
   - Show success message (toast or modal)
   - Auto-hide after 3 seconds (optional)

5. function getQueryParam(key)
   - Read URL query string parameter
   - Input: key like "user_id"
   - Output: value or null if not found

6. function enableButton(buttonId)
   - Remove disabled attribute from button
   - Reset text to original (optional)

7. function disableButton(buttonId, text)
   - Add disabled attribute to button
   - Set text to loading text like "Loading..." (optional)

8. function hideElement(elementId)
   - Set display: none on element

9. function showElement(elementId)
   - Set display: block on element

10. async function captureCanvasFrame(videoElement, quality)
    - Input: video HTML element, JPEG quality (0–1)
    - Output: base64-encoded JPEG string (with or without data-URI prefix)
    - Implementation: create canvas, draw video frame, toDataURL("image/jpeg", quality)

11. function setElementText(elementId, text)
    - Set innerText of element

12. function getElementValue(elementId)
    - Get value of input element

Behavior notes:
- No external dependencies (vanilla JS only)
- All functions are global (assigned to window or module scope)
- Error/success messages can be simple alert() or fancy toast UI (your choice, keep simple)
- Button enable/disable adds/removes "disabled" attribute
- captureCanvasFrame returns full data-URI with "data:image/jpeg;base64," prefix

Return only the file content, nothing else.
```

---

**Files: frontend/{index, register, scan, attendance, stats}.html**

Each HTML file follows this pattern:

**File: frontend/index.html**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in HTML5, CSS, and UX.

Your task is to generate the file: frontend/index.html

Purpose: Home/landing page for the attendance system.

Requirements:

1. Document structure:
   - <!DOCTYPE html>
   - <html lang="en">
   - <head> with meta charset, viewport, title, link to styles.css, links to api.js and app.js
   - <body>

2. Content:
   - Header with site title "Smart Attendance System"
   - Navigation menu with links to all pages:
     - Home (index.html)
     - Register (register.html)
     - Scan (scan.html)
     - Attendance (attendance.html)
     - Statistics (stats.html)
   - Welcome section with project description
   - Quick stat cards showing:
     - Total registered users
     - Attendance today
     - Currently present
   - Status indicator (green if model_ready, red if not)
   - Call-to-action buttons: "Register New User", "Scan Attendance"

3. Styling:
   - Responsive layout (mobile-first)
   - Use styles.css classes for styling
   - Clean, professional appearance

4. JavaScript:
   - On page load: call healthCheck() to verify server and model status
   - Fetch and display stats using getStatsToday()
   - Refresh stats every 5 seconds
   - Handle errors gracefully with displayError()

Return only the file content, nothing else.
```

---

**File: frontend/register.html**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in HTML5, CSS, and JavaScript.

Your task is to generate the file: frontend/register.html

Purpose: User registration page with live camera capture.

Requirements:

1. Document structure:
   - <!DOCTYPE html>
   - <html lang="en">
   - <head> with title, styles, scripts
   - <body>

2. UI Components:
   - Text input for user name (id="userName")
   - Video preview element (id="videoPreview") showing live camera
   - "Start Camera" button (id="startCameraBtn")
   - "Capture Sample" button (id="captureSampleBtn")
   - Sample counter display (id="sampleCount") showing "0 / 10"
   - List or grid of captured thumbnail images (id="capturedSamples")
   - "Register User" button (id="registerBtn")
   - Status message area (id="statusMessage")

3. JavaScript Logic:
   - On page load: request camera permission (navigator.mediaDevices.getUserMedia)
   - "Start Camera" button: start video stream from webcam
   - "Capture Sample" button: capture current frame, store base64 locally, display thumbnail
   - Update sample counter
   - "Register User" button: send all captured samples + name to registerUser() API
   - Display success or error message
   - Disable buttons during processing

4. Styling:
   - Video element should display live camera feed
   - Thumbnails in grid layout
   - Buttons styled consistently with other pages
   - Responsive on mobile

Return only the file content, nothing else.
```

---

**File: frontend/scan.html**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in HTML5, JavaScript, and real-time UX.

Your task is to generate the file: frontend/scan.html

Purpose: Live attendance scanning page.

Requirements:

1. Document structure:
   - <!DOCTYPE html>
   - <html lang="en">
   - <head> with title, styles, scripts
   - <body>

2. UI Components:
   - Large video preview (id="videoPreview") showing live camera
   - "Scan" button (id="scanBtn")
   - Result display area (id="scanResult") showing:
     - Status (marked, already_marked, no_face, no_match)
     - User name (if matched)
     - Time (if marked)
     - Confidence score
   - Recent scan history list (id="recentScans") showing last 10 scans
   - Navigation links to other pages

3. JavaScript Logic:
   - On page load: start video stream from webcam
   - "Scan" button: capture current frame, send to scanFrame() API
   - Display result with visual feedback (green for success, red for no_match, etc.)
   - Auto-refresh recent scan history (poll logs endpoint)
   - Update recent scans list with each new scan
   - Handle errors gracefully

4. Styling:
   - Prominent scan button (large, centered)
   - Result display with large, readable text
   - Recent scans in table or list format
   - Color-coded status (green=marked, orange=already_marked, red=no_match)

Return only the file content, nothing else.
```

---

**File: frontend/attendance.html**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in HTML5, JavaScript, and data tables.

Your task is to generate the file: frontend/attendance.html

Purpose: View attendance records page.

Requirements:

1. Document structure:
   - <!DOCTYPE html>
   - <html lang="en">
   - <head> with title, styles, scripts
   - <body>

2. UI Components:
   - Filter section:
     - Date picker (id="dateFilter")
     - User name dropdown (id="userFilter")
     - "Apply Filters" button (id="filterBtn")
   - Attendance records table (id="attendanceTable") with columns:
     - User Name
     - Date
     - Check-in Time
     - Check-out Time
     - Duration (if checked out)
   - Total records count (id="recordCount")
   - "Export to CSV" button (optional, id="exportBtn")
   - Navigation links

3. JavaScript Logic:
   - On page load: fetch all attendance records using getAttendance()
   - Display records in table format
   - Apply filters when "Apply Filters" button clicked
   - Populate user dropdown from listUsers() API
   - Calculate duration if both times present
   - Format dates and times using helper functions
   - Handle empty results gracefully

4. Styling:
   - Responsive table (scrollable on mobile)
   - Alternating row colors
   - Filter section clearly separated
   - Clear column headers

Return only the file content, nothing else.
```

---

**File: frontend/stats.html**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in HTML5, JavaScript, and dashboard UI.

Your task is to generate the file: frontend/stats.html

Purpose: Today's attendance statistics dashboard.

Requirements:

1. Document structure:
   - <!DOCTYPE html>
   - <html lang="en">
   - <head> with title, styles, scripts
   - <body>

2. UI Components:
   - Dashboard title "Today's Statistics"
   - Date display (id="todayDate")
   - Stat cards (id="statCards") displaying:
     - Total Registered Users
     - Present Today (checked in)
     - Currently Present (not checked out)
     - Checked Out
     - Attendance Percentage (with progress bar)
   - "Refresh" button (id="refreshBtn")
   - Auto-refresh toggle (id="autoRefreshToggle", default on)
   - Navigation links

3. JavaScript Logic:
   - On page load: fetch stats using getStatsToday()
   - Display stats in card format with large numbers
   - Show attendance percentage as progress bar (0–100%)
   - Auto-refresh every 5 seconds if toggle is on
   - "Refresh" button: manual refresh
   - Format percentage with 2 decimal places
   - Handle errors gracefully

4. Styling:
   - Large, readable stat numbers
   - Progress bar for percentage (color: green if > 80%, orange if 50–80%, red if < 50%)
   - Responsive card layout (grid or flex)
   - Smooth transitions for stat updates

Return only the file content, nothing else.
```

---

**File: frontend/styles.css**

**Prompt:**

```
You are a senior software engineer with 20+ years of experience in CSS3 and responsive design.

Your task is to generate the file: frontend/styles.css

Purpose: Global styling for all frontend pages.

Requirements:

1. CSS Variables (define in :root):
   - --primary-color: #0066cc (blue)
   - --success-color: #28a745 (green)
   - --danger-color: #dc3545 (red)
   - --warning-color: #ffc107 (yellow)
   - --bg-light: #f8f9fa (light gray)
   - --text-dark: #333333
   - --border-radius: 8px
   - --shadow: 0 2px 8px rgba(0,0,0,0.1)

2. Global Styles:
   - * { margin: 0, padding: 0, box-sizing: border-box }
   - body: font-family sans-serif, line-height 1.6, color var(--text-dark)
   - a: text-decoration none, color var(--primary-color)

3. Layout Components:
   - .container: max-width 1200px, margin 0 auto, padding 20px
   - .header: background var(--primary-color), color white, padding 20px
   - .nav: flexbox horizontal, list items, responsive menu
   - .main: min-height 100vh, padding 20px
   - .footer: background var(--bg-light), padding 20px

4. Form Components:
   - input, textarea, select: border 1px solid #ddd, padding 10px, border-radius var(--border-radius)
   - .form-group: margin-bottom 15px
   - label: display block, margin-bottom 5px, font-weight bold
   - .btn: padding 10px 20px, border none, border-radius var(--border-radius), cursor pointer
   - .btn-primary: background var(--primary-color), color white
   - .btn-success: background var(--success-color), color white
   - .btn-danger: background var(--danger-color), color white
   - .btn:disabled: opacity 0.5, cursor not-allowed

5. Content Components:
   - .card: background white, border 1px solid #ddd, border-radius var(--border-radius), padding 20px, box-shadow var(--shadow)
   - .table: width 100%, border-collapse collapse
   - .table th: background var(--bg-light), padding 10px, text-align left, font-weight bold
   - .table td: padding 10px, border-bottom 1px solid #ddd
   - .table tr:hover: background var(--bg-light)
   - .alert: padding 15px, border-radius var(--border-radius), margin-bottom 15px
   - .alert-success: background #d4edda, color #155724
   - .alert-danger: background #f8d7da, color #721c24
   - .alert-info: background #d1ecf1, color #0c5460

6. Video & Canvas:
   - video: max-width 100%, border-radius var(--border-radius)
   - canvas: display none (for capture)

7. Responsive Design (mobile-first):
   - @media (max-width 768px):
     - .nav: vertical layout, stack items
     - .container: padding 10px
     - .table: font-size smaller, overflow-x auto

8. Utility Classes:
   - .text-center: text-align center
   - .mt-3: margin-top 20px
   - .mb-3: margin-bottom 20px
   - .hidden: display none
   - .visible: display block
   - .flex: display flex
   - .flex-center: justify-content center, align-items center
   - .grid: display grid, grid-template-columns repeat(auto-fit, minmax(250px, 1fr)), gap 15px

Return only the file content (CSS only, no HTML or JS), nothing else.
```

---

## Build Sequence & Checkpoints

### Strict Order of File Creation

Follow this sequence exactly. Do not skip or reorder.

1. **requirements.txt** — Dependencies
2. **database/models.py** — Database schema
3. **attendance/attendance_service.py** — Business logic
4. **vision/detector.py** — Face detection
5. **vision/aligner.py** — Face alignment
6. **vision/embedder.py** — Face embedding
7. **api/errors.py** — Custom exceptions
8. **api/routes.py** — API endpoints (complex, most interdependent)
9. **api/server.py** — FastAPI app, lifespan
10. **frontend/api.js** — API wrappers
11. **frontend/app.js** — Utility functions
12. **frontend/index.html** — Home page
13. **frontend/register.html** — Registration page
14. **frontend/scan.html** — Scanning page
15. **frontend/attendance.html** — Attendance records
16. **frontend/stats.html** — Statistics dashboard
17. **frontend/styles.css** — Global styling

### Checkpoint 1: Backend Startup (After step 9)

**Goal:** Verify the backend API starts and responds to health checks.

**Steps:**
1. Create a Python 3.10+ virtual environment
2. Install dependencies: `pip install -r requirements.txt`
3. Create empty directories: `mkdir -p logs frontend`
4. Run backend: `uvicorn api.server:app --reload --host 127.0.0.1 --port 8000`
5. Test health check: `curl http://127.0.0.1:8000/api/health`

**Expected Output (health check):**
```json
{
  "status": "ok",
  "service": "smart-attendance-api",
  "model_ready": true
}
```

**Troubleshooting:**
- If model_ready is false, the model is still downloading; wait and retry
- If connection refused, backend is not running
- If errors, check logs/attendance.log for details

### Checkpoint 2: Frontend Startup (After step 17)

**Goal:** Verify all frontend pages load and API communication works.

**Steps:**
1. Start Python HTTP server in frontend directory: `cd frontend && python -m http.server 8080`
2. Open browser: http://127.0.0.1:8080/index.html
3. Test pages:
   - Home page loads, displays stats
   - Register page: camera access requested, page interactive
   - Scan page: video preview shows camera feed
   - Attendance page: displays empty table (no records yet)
   - Stats page: shows today's statistics

**Expected Behavior:**
- All pages load without errors
- Console (F12) shows no 404 or CORS errors
- Stats are fetched and displayed
- Model status shown on home page

### Checkpoint 3: End-to-End Flow (Manual Test)

**Goal:** Register a user and perform a scan.

**Steps:**
1. Navigate to register.html
2. Enter name "Test User"
3. Click "Start Camera" → allow camera access
4. Click "Capture Sample" 5–10 times
5. Click "Register User" → user should be created
6. Navigate to scan.html
7. Click "Scan" → should detect your face
8. If match found → attendance marked
9. Navigate to attendance.html → record should appear

**Expected Behavior:**
- User registration succeeds (embeddings_stored > 0)
- Scan detects face (status != no_face)
- Scan finds match (status = marked or already_marked)
- Attendance record appears in attendance page

---

## Validation Checklist

Use this checklist to verify the rebuild is complete and correct:

### Database & Backend

- [ ] Database file (attendance.db) is created on first backend start
- [ ] Tables exist: users, face_embeddings, attendance
- [ ] All columns are present with correct types
- [ ] Migrations work: old databases with missing checkout_time column are upgraded
- [ ] FaceDatabase class methods work: add_user(), add_embedding(), get_all_embeddings_by_user_id(), etc.
- [ ] AttendanceService marks attendance correctly (one per day rule enforced)
- [ ] AttendanceService marks checkout correctly

### Vision Pipeline

- [ ] FaceDetector detects faces (returns non-empty list for face images)
- [ ] FaceDetector returns empty list for non-face images
- [ ] FaceAligner crops and resizes to 112×112 exactly
- [ ] FaceAligner returns None for invalid bounding boxes
- [ ] FaceEmbedder lazy-loads model on first call
- [ ] FaceEmbedder returns 512-dimensional float32 arrays
- [ ] Cosine similarity computation is correct (0.55 is a good match)

### API Endpoints

- [ ] GET /api/health works, model_ready is true/false appropriately
- [ ] POST /api/users creates users and stores embeddings
- [ ] GET /api/users lists all users
- [ ] DELETE /api/users/{id} deletes users
- [ ] POST /api/attendance/scan matches faces and marks attendance
- [ ] GET /api/attendance retrieves records
- [ ] GET /api/stats/today returns correct statistics
- [ ] All error responses have correct HTTP status codes (400, 422, 503, 500)
- [ ] All error responses include "error" and "type" fields

### Frontend

- [ ] All HTML pages load without 404 errors
- [ ] Camera permission is requested and granted
- [ ] Video preview shows live camera feed
- [ ] Buttons enable/disable correctly during API calls
- [ ] Error messages display on failed API calls
- [ ] Success messages display on successful actions
- [ ] JSON responses are parsed correctly
- [ ] Tables display data without formatting errors
- [ ] Navigation between pages works
- [ ] Stats refresh automatically every 5 seconds

### Constants & Frozen Values

- [ ] Route paths match spec exactly (e.g., /api/attendance/scan, not /api/scan)
- [ ] Scan status values are exact: "marked", "already_marked", "no_face", "no_match"
- [ ] Table names are exact: users, face_embeddings, attendance
- [ ] Column names are exact (e.g., checkout_time, not checkout_date)
- [ ] Class names are exact (FaceDatabase, FaceDetector, FaceAligner, FaceEmbedder, etc.)
- [ ] Match threshold is 0.55 (cosine similarity)
- [ ] Face size target is 112×112 pixels
- [ ] Embedding dimension is 512

### Logs & Observability

- [ ] logs/attendance.log file is created
- [ ] Scan attempts are logged with timestamp
- [ ] Errors are logged with full traceback
- [ ] Log file rotates at 5MB (backups: .1, .2, .3)

### Deliverables Summary

The following files have been described with exact prompts:

**Backend:**
1. requirements.txt
2. database/models.py
3. attendance/attendance_service.py
4. vision/detector.py
5. vision/aligner.py
6. vision/embedder.py
7. api/errors.py
8. api/routes.py
9. api/server.py

**Frontend:**
10. frontend/api.js
11. frontend/app.js
12. frontend/index.html
13. frontend/register.html
14. frontend/scan.html
15. frontend/attendance.html
16. frontend/stats.html
17. frontend/styles.css

---

## Summary

This document provides everything a new team needs to rebuild the Smart Attendance System backend exactly as it is.

**Key Features:**
- Plain-language explanations (project overview, data model, architecture)
- Frozen contracts (route names, status values, database schema)
- Detailed specifications (API contracts, error handling, business rules)
- Per-file generation prompts for AI tools (ChatGPT, Claude, etc.)
- Build sequence with checkpoints
- Validation checklist

**How to Use:**
1. Read sections 1–9 to understand the system
2. Follow the build sequence (files 1–17 in order)
3. For each file:
   - Copy the prompt from section 11 (File-by-File Generation Prompts)
   - Paste into ChatGPT or your preferred LLM
   - Save the generated content to the specified file path
4. After step 9, run Checkpoint 1 (backend startup)
5. After step 17, run Checkpoint 2 (frontend startup)
6. Run Checkpoint 3 (end-to-end manual test)
7. Use the Validation Checklist to verify completeness

**Notes:**
- This guide is technology-agnostic: generation can be done by humans, AI, or automation
- All frozen values (routes, table names, class names) are enforced to prevent integration breakage
- Error handling is non-fatal where appropriate (graceful degradation)
- Logging is structured for debugging

Good luck with the rebuild!

---

**Document Metadata**

- **Created:** 24 April 2026
- **System Version:** 1.0.0
- **Backend Language:** Python 3.10+
- **Frontend Language:** Vanilla JavaScript (no framework)
- **Database:** SQLite3
- **ML Model:** ArcFace (InsightFace)
- **Deployment:** Single-machine, CPU-only

