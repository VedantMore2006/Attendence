# Smart Attendance System

> **A full-stack, AI-powered biometric attendance platform using real-time face recognition — no swipe cards, no manual registers, no excuses.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Why This Project?](#2-why-this-project)
3. [Why Face Recognition — and Why This Approach?](#3-why-face-recognition--and-why-this-approach)
4. [How It Differs from Existing Solutions](#4-how-it-differs-from-existing-solutions)
5. [System Architecture](#5-system-architecture)
6. [Technology Stack](#6-technology-stack)
7. [Face Recognition Pipeline (Deep Dive)](#7-face-recognition-pipeline-deep-dive)
8. [Database Design](#8-database-design)
9. [API Reference](#9-api-reference)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Logging System](#11-logging-system)
12. [Project Structure](#12-project-structure)
13. [Setup & Running](#13-setup--running)
14. [Performance Characteristics & Scalability](#14-performance-characteristics--scalability)
15. [Current Limitations](#15-current-limitations)
16. [Future Perspectives & Roadmap](#16-future-perspectives--roadmap)
17. [Contributing](#17-contributing)

---

## 1. Project Overview

**Smart Attendance System (SAS)** is a locally-hosted, full-stack attendance management platform that uses **real-time facial recognition** to automatically identify and record attendance — without any physical contact, RFID cards, or manual input.

The system is built entirely with open-source tools and runs on a standard machine with a webcam. A student or employee simply walks up to a camera-enabled terminal, looks at the screen, and their attendance is marked in under a second. No touching, no queuing, no human error.

| Property | Value |
|---|---|
| **Status** | Functional Prototype (Local Deployment) |
| **Current Users** | 3 registered (test dataset) |
| **Current Embeddings** | 15 stored (avg. 5 per user) |
| **Inference Time** | ~300–700 ms per scan (CPU) |
| **Match Threshold** | 0.55 cosine similarity |
| **Database** | SQLite (single file) |
| **Frontend** | Static HTML/CSS/JS served locally |
| **Backend** | FastAPI over Uvicorn (ASGI) |

---

## 2. Why This Project?

### The Problem with Traditional Attendance

Every institution — school, university, corporate office, factory floor — faces the same friction every single day: **recording who showed up**.

Traditional methods carry well-known problems:

| Method | Problem |
|---|---|
| Paper registers | Slow, error-prone, easy to proxy-sign |
| RFID / smart cards | Cards can be shared; lost cards break the system |
| PIN-based terminals | PINs can be shared or shoulder-surfed |
| Biometric fingerprint scanners | Physical contact required; hygiene concern post-COVID; expensive hardware |
| QR code / OTP systems | Easily proxied from phones; requires internet connectivity |

All of these methods share a fundamental weakness: **they authenticate a token (card, PIN, phone, finger) rather than the person**. Proxy attendance — where someone else marks attendance on your behalf — remains trivially easy.

### The Face Recognition Solution

Face recognition directly authenticates **the actual person** by measuring unique geometric and texture-based features of their face. It is:

- **Non-contact** — no touching required
- **Passive** — the subject doesn't need to take any action
- **Non-proxiable** — you cannot send your face in your place (without sophisticated spoofing, addressed in limitations)
- **Fast** — attendance marked in under a second
- **Scalable** — one camera can serve a room of people

### Why Build It from Scratch?

Existing enterprise systems (discussed in Section 4) are either:
- Proprietary black boxes requiring expensive hardware
- Cloud-dependent, raising privacy concerns for student biometric data
- Overkill for single-classroom or small-office use
- Not educational — they provide no insight into how the underlying recognition works

This project was built as a **transparent, understandable, and locally-sovereign** alternative that demonstrates every layer of the pipeline — from raw pixels through neural network embeddings to database records and a polished web UI.

---

## 3. Why Face Recognition — and Why This Approach?

### The Core Recognition Question

How does a computer reliably say "this face is Person A, not Person B"? The naive approach — comparing pixel values directly — fails immediately because the same person looks vastly different under different lighting, at different angles, with different expressions, or across different days.

The modern answer is **deep metric learning**: train a neural network to map any face image to a point in a high-dimensional space, such that images of the *same* person cluster near each other and images of *different* people are far apart. The distance between two embeddings becomes the recognition confidence.

### Why ArcFace?

This system uses **ArcFace** (Additive Angular Margin Loss), currently the state-of-the-art open-source face recognition model, as implemented in **InsightFace**.

ArcFace's key insight is its loss function. Traditional softmax classification trains the model to predict identity labels. ArcFace instead adds an **angular margin penalty** — it forces the network to learn embeddings where the same person's faces form tight, well-separated clusters in angular space (on a hypersphere), not just in Euclidean space. This produces:

- **Better generalization** — unseen faces of known people still cluster correctly
- **Higher accuracy** — state-of-the-art on LFW, IJB-C, MegaFace benchmarks
- **Compact representations** — 512 floats encode a face completely
- **Cosine similarity as distance** — interpretable, normalized, threshold-compatible

The specific model used is `buffalo_l` from InsightFace, which bundles:
- **w600k_r50.onnx**: ArcFace with ResNet-50 backbone, trained on ~600K identities
- Input: 112×112 BGR face crop
- Output: 512-dimensional L2-normalized embedding vector

### Why MediaPipe for Detection?

Before ArcFace can embed a face, we need to find where the face is in the frame. This system uses **MediaPipe BlazeFace** for detection because:

- **Speed**: BlazeFace runs in ~5–15 ms on CPU (designed for mobile inference)
- **Reliability**: Handles partial occlusion, varied lighting, and tilted faces
- **No GPU required**: Full pipeline runs on CPU only
- **Single dependency**: MediaPipe bundles the detector model automatically

The alternative (running InsightFace's own detection) would add ~100–200 ms per frame and requires heavier compute.

### Why Cosine Similarity?

After extraction, each embedding is an L2-normalized 512-dimensional vector (a point on the unit hypersphere). To compare two embeddings:

```
similarity = dot(embedding_A, embedding_B) / (||embedding_A|| × ||embedding_B||)
```

Because both vectors are already normalized (‖v‖ = 1), this simplifies to `dot(A, B)`, producing a value in [−1, +1]:

- **1.0**: Identical vectors (same photo)
- **0.8+**: Very high confidence same person
- **0.55–0.79**: Likely same person (above match threshold)
- **< 0.55**: Different person (below match threshold, rejected)

The **threshold of 0.55** was chosen empirically to balance:
- **False Accept Rate (FAR)**: Incorrectly accepting an impostor
- **False Reject Rate (FRR)**: Incorrectly rejecting a legitimate user

A lower threshold (0.40) accepts more matches, increasing FAR. A higher threshold (0.70) rejects more, increasing FRR. For attendance purposes (where a false reject just means "scan again"), 0.55 is a reasonable operational point.

---

## 4. How It Differs from Existing Solutions

### Comparison with Commercial Products

| Feature | Smart Attendance System | ZKTeco FaceID | HikVision FaceTerminal | AWS Rekognition | Frappe HR |
|---|---|---|---|---|---|
| **Cost** | Free / Open-source | $300–$800/device | $200–$500/device | Pay-per-API-call | SaaS subscription |
| **Privacy** | 100% local | On-device | On-device | Cloud (AWS) | Cloud |
| **Transparency** | Full source code | Black box | Black box | Black box | Partial |
| **Customizable** | Yes | No | No | Limited | Yes |
| **Hardware needed** | Any webcam | Proprietary terminal | Proprietary terminal | Cloud API | Any camera |
| **Anti-spoofing** | Not yet | Yes (IR depth) | Yes (IR depth) | Yes | Limited |
| **Offline operation** | Yes | Yes | Yes | No | Partial |
| **Multi-location** | Not yet | Yes | Yes | Yes | Yes |
| **Student biometric data sovereignty** | Fully local | Stored on device | Stored on device | AWS cloud | SaaS cloud |
| **Educational transparency** | Yes | No | No | No | No |

### Key Differentiators

**1. Zero Cloud Dependency**
The entire pipeline — detection, embedding, matching, storage, UI — runs on the local machine. No face data ever leaves the system. This is critical for compliance with privacy laws (GDPR, India's DPDP Act 2023) that impose strict requirements on biometric data processing.

**2. Plug-and-Play with Any Webcam**
Commercial systems require proprietary infrared terminals costing hundreds to thousands of dollars per unit. This system works with any USB or built-in webcam costing under ₹500.

**3. Full Pipeline Transparency**
Every step is inspectable, modifiable, and understandable. Researchers and students can audit exactly how a face becomes an attendance record — which is impossible with any commercial black box.

**4. Modern Web UI Without Frameworks**
Unlike many open-source projects that require React/Vue/Angular build chains, this system's frontend is pure HTML/CSS/JavaScript — zero npm, zero bundler, zero build step. It works immediately from a static file server with no dependency installation on the client side.

**5. Structured Logging Architecture**
A structured, rotating log file records every scan event with timestamp, result, user identity, and confidence score. This creates an auditable trail that commercial systems often only expose through expensive reporting modules.

---

## 5. System Architecture

### High-Level Component Map

```
┌─────────────────────────────────────────────────────────┐
│                      Browser Client                      │
│                                                         │
│   index.html   scan.html   register.html                │
│   stats.html   attendance.html                          │
│                                                         │
│   api.js (fetch wrapper)   app.js (page logic)          │
│   styles.css (glassmorphic dark theme)                  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / JSON (port 8080 → 8000)
                         │
┌────────────────────────▼────────────────────────────────┐
│                  FastAPI Backend (port 8000)             │
│                                                         │
│   api/server.py      — App init, logging, lifespan      │
│   api/routes.py      — All endpoints + vision pipeline  │
│   api/errors.py      — Custom exceptions + handlers     │
│                                                         │
│   attendance/attendance_service.py — Business logic     │
└──────┬──────────────────────────────┬───────────────────┘
       │                              │
┌──────▼──────────┐        ┌──────────▼──────────────────┐
│  Vision Pipeline │        │         SQLite Database      │
│                  │        │                              │
│  detector.py     │        │   database/models.py         │
│  MediaPipe       │        │   FaceDatabase class         │
│  BlazeFace       │        │                              │
│                  │        │   Tables:                    │
│  aligner.py      │        │   - users                    │
│  112×112 crop    │        │   - face_embeddings          │
│                  │        │   - attendance               │
│  embedder.py     │        │                              │
│  InsightFace     │        │   attendance.db              │
│  ArcFace R50     │        │   (binary, local file)       │
│  512-dim vector  │        └──────────────────────────────┘
└──────────────────┘
```

### Request Lifecycle (Scan Attendance)

```
Browser                     FastAPI                   Vision Pipeline            SQLite
  │                            │                            │                       │
  │──POST /api/attendance/scan─▶│                            │                       │
  │  {image: "base64..."}       │                            │                       │
  │                            │──decode_base64_image()──▶  │                       │
  │                            │  (strip prefix, OpenCV)    │                       │
  │                            │──detect_faces()────────▶   │                       │
  │                            │                            │ MediaPipe BlazeFace   │
  │                            │◀────────────────────────── │ → bounding boxes      │
  │                            │──_pick_largest_box()        │                       │
  │                            │──align_face()──────────▶   │                       │
  │                            │                            │ crop + resize 112×112 │
  │                            │◀────────────────────────── │                       │
  │                            │──get_embedding()───────▶   │                       │
  │                            │                            │ ArcFace ONNX          │
  │                            │◀────────────────────────── │ → 512-dim vector      │
  │                            │──get_all_embeddings()─────────────────────────────▶│
  │                            │◀─────────────────────────────────────────────────── │
  │                            │  (list of stored vectors)                           │
  │                            │──cosine_similarity() × N   │                       │
  │                            │  find best match           │                       │
  │                            │──mark_attendance()────────────────────────────────▶│
  │                            │◀─────────────────────────────────────────────────── │
  │◀────────────────────────── │                            │                       │
  │  {status, name, time,       │                            │                       │
  │   confidence}               │                            │                       │
```

---

## 6. Technology Stack

### Complete Stack Table

| Layer | Technology | Version | Role |
|---|---|---|---|
| **Frontend Language** | HTML5 | — | Page structure |
| **Frontend Style** | CSS3 | — | Glassmorphic dark UI |
| **Frontend Logic** | JavaScript (Vanilla ES6+) | — | Camera, API calls, state |
| **Camera API** | WebRTC (`getUserMedia`) | — | Live webcam streaming |
| **Backend Language** | Python | 3.10+ | All server-side logic |
| **Web Framework** | FastAPI | ≥0.112.0 | REST API, routing, validation |
| **ASGI Server** | Uvicorn | ≥0.30.0 | Async HTTP server |
| **Data Validation** | Pydantic | ≥2.0.0 | Request/response schemas |
| **Face Detection** | MediaPipe BlazeFace | 0.10.14 | Bounding box detection |
| **Face Embedding** | InsightFace (ArcFace R50) | ≥0.7.3 | 512-dim face vectors |
| **ML Inference** | ONNX Runtime | ≥1.17.0 | Runs ArcFace ONNX model |
| **Image Processing** | OpenCV | ≥4.8.0 | Decode, crop, resize, BGR |
| **Numerical Computing** | NumPy | ≥1.24.0,<2.0 | Vector ops, cosine similarity |
| **Database** | SQLite3 | (stdlib) | Persistent local storage |
| **Form Parsing** | python-multipart | ≥0.0.6 | File upload support |
| **Date Utilities** | python-dateutil | ≥2.8.2 | Robust date parsing |
| **Env Config** | python-dotenv | ≥1.0.0 | `.env` variable loading |
| **Legacy Dashboard** | Streamlit | ≥1.33.0 | (Optional) data dashboard |
| **Data Analysis** | Pandas | ≥2.0.0 | (Optional) for Streamlit |

### Why These Specific Choices?

#### FastAPI over Flask / Django
- **Async-first**: Uvicorn + FastAPI handle concurrent requests without blocking
- **Auto-generated OpenAPI docs**: Swagger UI at `/docs` out of the box
- **Pydantic integration**: Type-safe request/response parsing with zero boilerplate
- **Performance**: Among the fastest Python web frameworks (comparable to Node.js)

#### SQLite over PostgreSQL / MySQL
- **Zero configuration**: Single file (`attendance.db`), no server process
- **Sufficient for prototype scale**: Handles thousands of records without issues
- **Portable**: The entire database is a single file — backup = copy file
- **Standard library**: `sqlite3` module requires no additional installation

The trade-off is concurrency: SQLite uses file-level locking, making it unsuitable for many concurrent writers. For a single-terminal local deployment, this is never triggered.

#### MediaPipe over MTCNN / RetinaFace
- **Speed**: BlazeFace runs in 5–15 ms vs. MTCNN's 50–200 ms on CPU
- **No GPU needed**: Designed for mobile inference (ARM CPU optimized)
- **Maintained by Google**: Active development, cross-platform support

#### InsightFace buffalo_l over FaceNet / DeepFace
- **State of the art**: ArcFace consistently tops face verification benchmarks
- **Open weights**: `buffalo_l` model auto-downloads, no account required
- **ONNX format**: Single `.onnx` file, runs on any platform via ONNX Runtime
- **Compact**: 512 floats per face vs. FaceNet's 128 (more discriminative)

#### Vanilla JS over React/Vue/Angular
- **Zero build step**: Works immediately, no npm install required
- **No client-side dependencies**: Page loads from any static file server
- **Simpler debugging**: No JSX, no virtual DOM, no framework magic
- **Educational clarity**: Every line is standard web platform API

---

## 7. Face Recognition Pipeline (Deep Dive)

### Stage 1: Image Ingestion

The browser captures a frame from the webcam using the `<canvas>` API:

```javascript
// In frontend/app.js
captureFrame(videoId, mirror) {
    const video = document.getElementById(videoId);
    canvas.width  = video.videoWidth;   // 640
    canvas.height = video.videoHeight;  // 480
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);  // base64 data-URI, ~40–80 KB
}
```

The browser POSTs this base64-encoded JPEG to `POST /api/attendance/scan`.

### Stage 2: Base64 Decoding

```python
# api/routes.py → decode_base64_image()
if "," in b64_str:
    b64_str = b64_str.split(",", 1)[1]      # Strip "data:image/jpeg;base64,"

raw_bytes = base64.b64decode(b64_str, validate=True)
np_arr    = np.frombuffer(raw_bytes, dtype=np.uint8)
frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)  # → BGR ndarray (480, 640, 3)
```

Validation checks: non-empty string, valid base64, decodable by OpenCV, minimum 10×10 px.

### Stage 3: Face Detection (MediaPipe BlazeFace)

```python
# vision/detector.py
mp_face  = mp.solutions.face_detection
detector = mp_face.FaceDetection(
    model_selection=0,            # Fast/lite model (up to ~2m range)
    min_detection_confidence=0.5
)

result = detector.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
# Returns bounding boxes as [[x1, y1, x2, y2], ...]
```

- Converts BGR → RGB (MediaPipe requirement)
- Returns normalized coordinates → converted to pixel coordinates
- `model_selection=0` = BlazeFace short-range (fast, handles faces ≤ ~2m)
- `model_selection=1` = Full-range model (slower, handles faces up to ~5m)

If no faces found → returns `ScanAttendanceResponse(status="no_face")`.

If multiple faces → `_pick_largest_box()` selects the face with the largest bounding box area (assumed to be the primary subject at the terminal).

### Stage 4: Face Alignment (Crop + Resize)

```python
# vision/aligner.py
def align_face(frame, bbox):
    x1, y1, x2, y2 = bbox
    face_crop    = frame[y1:y2, x1:x2]
    face_resized = cv2.resize(face_crop, (112, 112),
                              interpolation=cv2.INTER_LINEAR)
    return face_resized    # Shape: (112, 112, 3) BGR
```

**Note on alignment quality:** This implementation uses simple crop + resize without landmark-based warping. Production ArcFace systems typically use 5-point landmark detection to rotate and align the face to a canonical pose (eyes at fixed positions), improving embedding consistency across angles. The current approach is functional but less robust for extreme head rotations (>30° yaw/pitch).

### Stage 5: Embedding Extraction (ArcFace ONNX)

```python
# vision/embedder.py (simplified)
model = insightface.app.FaceAnalysis(name="buffalo_l",
                                     providers=['CPUExecutionProvider'])
model.prepare(ctx_id=0, det_size=(640, 480))

# Internal processing:
face_input = face_bgr.transpose(2, 0, 1)           # HWC → CHW: (3, 112, 112)
face_batch = np.expand_dims(face_input, 0)          # → (1, 3, 112, 112)
face_float = face_batch.astype(np.float32) / 127.5 - 1.0   # Normalize to [-1, 1]

embedding = onnx_session.run(None, {'input': face_float})[0]  # → (1, 512)
embedding = embedding / np.linalg.norm(embedding)             # L2-normalize
```

The model file (`~/.insightface/models/buffalo_l/w600k_r50.onnx`) is ~170 MB and auto-downloads on first use. The ResNet-50 backbone processes the 112×112 face through 50 convolutional layers to produce a 512-dimensional discriminative embedding.

### Stage 6: Database Matching (Linear Scan)

```python
# api/routes.py → _match_embedding()
stored = db.get_all_embeddings()    # List of (user_id, name, embedding_vector)

best_score = -1.0
best_match = None

for user_id, name, stored_emb in stored:
    sim = float(np.dot(query_emb, stored_emb))   # Cosine similarity (both L2-normalized)
    if sim > best_score:
        best_score = sim
        best_match = (user_id, name)

if best_score >= MATCH_THRESHOLD:   # 0.55
    return best_match[0], best_match[1], best_score
else:
    return None, None, best_score
```

**Complexity:** O(N × D) per query, where N = total stored embeddings (users × embeddings per user), D = 512.

This is a **brute-force linear scan**. For each query, every stored vector is loaded from SQLite and compared. See [Section 14](#14-performance-characteristics--scalability) for detailed performance analysis.

### Stage 7: Attendance Recording

```python
# attendance/attendance_service.py
def mark_attendance(self, db, user_id):
    today    = datetime.now().strftime("%Y-%m-%d")
    now      = datetime.now().strftime("%H:%M:%S")
    existing = db.get_attendance_by_user_and_date(user_id, today)

    if existing:
        return {"status": "already_marked", "message": "Already marked today"}

    db.add_attendance(user_id, today, now)
    return {"status": "marked", "time": now}
```

One attendance record per user per calendar day. Duplicate prevention is enforced at the application layer — consistent for single-server deployments but not ACID-atomic under concurrent access.

---

## 8. Database Design

### Schema

```sql
-- Registered identities
CREATE TABLE users (
    id         INTEGER   PRIMARY KEY AUTOINCREMENT,
    name       TEXT      NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Face embeddings (multiple per user for robustness)
CREATE TABLE face_embeddings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL,
    embedding BLOB    NOT NULL,   -- 512 × float32 = 2048 bytes binary
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Attendance log
CREATE TABLE attendance (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date    TEXT    NOT NULL,    -- "YYYY-MM-DD" (ISO 8601)
    time    TEXT    NOT NULL,    -- "HH:MM:SS"   (24-hour)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Embedding Storage Format

Embeddings are stored as raw binary BLOBs:
- 512 values × 4 bytes (float32) = **2,048 bytes per embedding**
- Serialized via `embedding.tobytes()` (NumPy)
- Deserialized via `np.frombuffer(blob, dtype=np.float32)`

Multiple embeddings per user (the system captures 2–5 images at registration) improve matching reliability across different angles, lighting conditions, and expressions. Each stored embedding is independently compared against the query — the highest similarity across all stored embeddings for a user wins.

### Entity-Relationship Diagram

```
users
  │  id (PK)
  │  name
  │  created_at
  │
  ├──< face_embeddings
  │     id (PK)
  │     user_id (FK → users.id)
  │     embedding (BLOB, 2048 bytes)
  │
  └──< attendance
        id (PK)
        user_id (FK → users.id)
        date (TEXT, YYYY-MM-DD)
        time (TEXT, HH:MM:SS)
```

---

## 9. API Reference

**Base URL:** `http://127.0.0.1:8000`
**Interactive Docs:** `http://127.0.0.1:8000/docs` (Swagger UI)
**OpenAPI Schema:** `http://127.0.0.1:8000/openapi.json`

---

### Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "smart-attendance-api",
  "model_ready": true
}
```

`model_ready: false` means the ArcFace model is still initializing. Scan requests during this window return `503 Service Unavailable`.

---

### Users

#### Create User

```
POST /api/users
Content-Type: application/json
```

```json
{
  "name": "Vedant More",
  "images": ["data:image/jpeg;base64,...", "..."]
}
```

- `name`: 1–120 characters
- `images`: Array of base64-encoded JPEG webcam captures (2–5 recommended)
- For each image: runs the full vision pipeline (detect → align → embed) and stores the resulting 512-dim vector

**Response `201 Created`:**
```json
{
  "id": 4,
  "name": "Vedant More",
  "created_at": "2026-04-08T10:30:00",
  "embeddings_stored": 4,
  "embeddings_failed": 0
}
```

#### List Users

```
GET /api/users
```

**Response `200 OK`:**
```json
[
  { "id": 1, "name": "Vedant More", "created_at": "2026-04-06T23:00:00" },
  { "id": 2, "name": "v2",          "created_at": "2026-04-07T09:15:00" }
]
```

#### Delete User

```
DELETE /api/users/{user_id}
```

Cascades: deletes all associated `face_embeddings` and `attendance` records.

**Response `204 No Content`**

---

### Attendance

#### Scan & Mark (Primary Endpoint)

```
POST /api/attendance/scan
Content-Type: application/json
```

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

Runs the full pipeline: decode → detect → align → embed → match → (optionally) mark.

**Response `200 OK` — Marked:**
```json
{
  "status": "marked",
  "message": "Attendance marked for Vedant More",
  "name": "Vedant More",
  "time": "09:32:15",
  "user_id": 1,
  "confidence": 0.8005
}
```

**Response `200 OK` — Already Marked:**
```json
{
  "status": "already_marked",
  "message": "Vedant More already marked attendance today",
  "name": "Vedant More",
  "time": "09:32:15",
  "user_id": 1,
  "confidence": 0.8005
}
```

**Response `200 OK` — No Face:**
```json
{
  "status": "no_face",
  "message": "No face detected in the frame. Please reposition."
}
```

**Response `200 OK` — No Match:**
```json
{
  "status": "no_match",
  "message": "Face not recognized. Best similarity: 0.34. Please register first.",
  "confidence": 0.34
}
```

#### Manual Mark

```
POST /api/attendance/mark
Content-Type: application/json

{ "user_id": 1 }
```

Marks attendance by ID without a face scan (admin override).

#### List Attendance

```
GET /api/attendance
GET /api/attendance?date=2026-04-08
```

**Response `200 OK`:**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "Vedant More",
    "date": "2026-04-08",
    "time": "09:32:15"
  }
]
```

---

### Statistics

#### Today's Summary

```
GET /api/stats/today
```

**Response `200 OK`:**
```json
{
  "date": "2026-04-08",
  "total_users": 3,
  "present_users": 2,
  "attendance_percent": 66.67
}
```

---

### Logs

#### Recent Scan Events

```
GET /api/logs/recent
```

Parses the last 10 `SCAN result=` events from `logs/attendance.log`.

**Response `200 OK`:**
```json
[
  {
    "timestamp": "2026-04-08 09:32:15",
    "result": "marked",
    "user": "Vedant More",
    "user_id": "1",
    "confidence": "0.8005"
  }
]
```

---

### Error Responses

| HTTP Status | Error Type | Cause |
|---|---|---|
| `400` | `ImageDecodeError` | Corrupt or empty base64 image |
| `422` | `EmbeddingError` | Could not extract face embedding from image |
| `503` | `ModelNotReadyError` | ArcFace model still loading or failed to initialize |
| `500` | `DatabaseError` | SQLite operation failed |
| `500` | `InternalError` | Unhandled exception (no stack trace exposed to client) |

---

## 10. Frontend Architecture

### Pages

| Page | File | Purpose |
|---|---|---|
| Landing | `index.html` | Project overview, navigation hub |
| Live Scan | `scan.html` | Real-time face recognition terminal |
| Register | `register.html` | New user enrollment with webcam capture |
| Records | `attendance.html` | Historical attendance with date filter |
| Statistics | `stats.html` | Today's attendance summary dashboard |

### Design System

The UI uses a **glassmorphic dark theme** — a modern design language using translucent, blurred card surfaces over dark gradient backgrounds, inspired by frosted glass.

**Color Palette:**

| Role | Color | Hex |
|---|---|---|
| Background | Near-black | `#07090f` |
| Primary Accent | Orange gradient | `#f97316` → `#ea580c` |
| Success | Green | `#22c55e` |
| Warning | Amber | `#f59e0b` |
| Error | Red | `#ef4444` |
| Card surface | White / 6–8% opacity | `rgba(255,255,255,0.07)` |
| Card border | White / 10–12% opacity | `rgba(255,255,255,0.10)` |

**Key CSS components:**

```css
/* Glassmorphic card */
.card {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
}

/* Aurora glow background */
body::before {
    background: radial-gradient(ellipse at 20% 50%,
                rgba(249, 115, 22, 0.08) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 20%,
                rgba(234, 88, 12, 0.05) 0%, transparent 50%);
}
```

**Responsive breakpoints:**
- Mobile (`< 600px`): Stacked single-column layout
- Tablet (`600–900px`): Two-column grids
- Desktop (`> 900px`): Side-by-side panels, full navigation bar

### JavaScript Architecture

**`api.js`** — Thin HTTP client wrapping `fetch`:

```javascript
const API = {
    BASE: 'http://127.0.0.1:8000/api',

    async scanAttendance(imageBase64) {
        const res = await fetch(`${this.BASE}/attendance/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageBase64 })
        });
        return res.json();
    },
    // checkHealth, registerUser, getAttendance, getTodayStats,
    // getUsers, deleteUser, getRecentScanEvents
};
```

**`app.js`** — Page logic and state management:

```javascript
const App = {
    async startWebcam(videoId, mirror) { ... },
    stopWebcam() { ... },
    captureFrame(videoId, mirror) { ... },

    async initScanPage() { ... },
    async performScan() { ... },
    updateScanUI(status, name, confidence, time) { ... },

    async initRegisterPage() { ... },
    async registerUser() { ... },

    async loadAttendance() { ... },
    async loadStats() { ... },
};
```

**State Machine (Scan Page):**

```
READY
  │
  │ user clicks "Scan Face"
  ▼
SCANNING — spinner active, button disabled
  │
  │ API response received
  ├── marked         → SUCCESS  (green card, name + time + confidence %)
  ├── already_marked → WARNING  (amber card, "already marked today")
  ├── no_face        → ERROR    (red card, "reposition and try again")
  └── no_match       → ERROR    (red card, "face not registered")
                                    │
                         1.8s cooldown timer
                                    │
                                  READY
```

### Webcam Integration

```javascript
const constraints = {
    video: {
        width:      { ideal: 640 },
        height:     { ideal: 480 },
        facingMode: 'user'          // Front camera on mobile
    }
};

// Frame captured at JPEG quality 0.8 (~40–80 KB per frame)
canvas.toDataURL('image/jpeg', 0.8);
```

The **face guide oval** rendered on the scan page is a pure CSS overlay — an ellipse centered in the video container with animated corner indicators that guide the user's positioning, with no canvas drawing required.

---

## 11. Logging System

### Configuration

```python
# api/server.py
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)-5s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),                      # Console: INFO+
        RotatingFileHandler(
            'logs/attendance.log',
            maxBytes=5 * 1024 * 1024,                 # 5 MB per file
            backupCount=3,                            # Keep 3 rotations
            encoding='utf-8'
        )
    ]
)
```

### Log Format

```
2026-04-08 09:32:15 | INFO  | api.routes | SCAN result=marked  user=Vedant More  id=1  time=09:32:15  confidence=0.8005
2026-04-08 09:33:01 | INFO  | api.routes | SCAN result=already_marked  user=Vedant More  id=1
2026-04-08 09:34:22 | INFO  | api.routes | SCAN result=no_face
2026-04-08 09:35:10 | INFO  | api.routes | SCAN result=no_match  confidence=0.34
2026-04-08 09:36:00 | DEBUG | database.models | Added attendance for user_id=2 date=2026-04-08 time=09:36:00
```

### Log Levels

| Level | Destination | What is logged |
|---|---|---|
| DEBUG | File only | DB operations, embedding shapes, intermediate pipeline values |
| INFO | Console + File | Scan results, API startup events, model loading |
| WARNING | Console + File | AppErrors (invalid images, model not ready) |
| ERROR | Console + File | Unexpected exceptions caught by global handlers |

### Log Parsing

The `/api/logs/recent` endpoint uses regex to extract structured data from the last 10 `SCAN` events:

```python
pattern = re.compile(
    r'(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'
    r'.*?SCAN result=(?P<result>\w+)'
    r'(?:.*?user=(?P<user>[^|]+?))?'
    r'(?:.*?id=(?P<user_id>\d+))?'
    r'(?:.*?confidence=(?P<confidence>[\d.]+))?'
)
```

This powers the **Recent Activity** panel on the scan page — showing a live feed of the last 10 recognitions without querying the database.

---

## 12. Project Structure

```
Attendence/
│
├── api/                              # FastAPI application layer
│   ├── server.py                     # App factory, logging setup, lifespan hooks
│   ├── routes.py                     # All HTTP endpoints + vision pipeline integration
│   └── errors.py                     # Custom exception hierarchy + global handlers
│
├── attendance/                       # Business logic layer
│   └── attendance_service.py         # Duplicate prevention, mark attendance
│
├── database/                         # Data access layer
│   └── models.py                     # FaceDatabase class: schema init + CRUD operations
│
├── vision/                           # ML / Vision pipeline
│   ├── detector.py                   # MediaPipe BlazeFace face detection
│   ├── aligner.py                    # Face crop + resize to 112×112
│   └── embedder.py                   # InsightFace ArcFace 512-dim embedding
│
├── frontend/                         # Static web application
│   ├── index.html                    # Landing page
│   ├── scan.html                     # Live scan terminal
│   ├── register.html                 # User enrollment
│   ├── attendance.html               # Attendance records view
│   ├── stats.html                    # Today's statistics
│   ├── api.js                        # Fetch-based HTTP client
│   ├── app.js                        # Page logic + state management
│   └── styles.css                    # Glassmorphic dark theme
│
├── logs/
│   └── attendance.log                # Rotating application log (5 MB × 3 files)
│
├── attendance.db                     # SQLite database (auto-created on first run)
├── requirements.txt                  # Python dependencies (version-pinned)
├── README.md                         # This file
├── IMPLEMENTATION_SUMMARY.md         # Frontend architecture notes
└── database_cheatsheet.md            # Quick SQLite reference queries
```

### Layer Separation

The codebase follows a clean layered architecture with no circular dependencies:

```
frontend/       → Presentation layer   (user interaction, display)
api/            → Application layer    (HTTP routing, request validation)
attendance/     → Business logic layer (domain rules, duplicate prevention)
database/       → Data access layer    (SQL queries, schema management)
vision/         → Infrastructure layer (ML models, image processing)
```

Each layer communicates only downward — routes call services, services call database, vision is called by routes. Frontend communicates with `api/` only via HTTP.

---

## 13. Setup & Running

### System Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Linux, macOS, Windows 10+ | Ubuntu 22.04 / Windows 11 |
| Python | 3.10 | 3.11 |
| RAM | 2 GB | 4 GB |
| Disk (model + deps) | 500 MB free | 1 GB free |
| CPU | Any 64-bit x86 | 4+ cores |
| GPU | Not required | NVIDIA CUDA (speeds up inference ~10×) |
| Camera | Any USB/built-in webcam | 720p or better |
| Network | Required for first model download | — |

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd Attendence

# 2. Create and activate a Python virtual environment
python3.10 -m venv .venv
source .venv/bin/activate        # Linux / macOS
.\.venv\Scripts\activate         # Windows PowerShell

# 3. Install Python dependencies
pip install -r requirements.txt

# Note: On first API startup, InsightFace auto-downloads the buffalo_l model
# (~170 MB) to ~/.insightface/models/buffalo_l/
# Ensure internet connectivity for this one-time download.
```

### Running the System

**Terminal 1 — API server:**
```bash
uvicorn api.server:app --reload --host 127.0.0.1 --port 8000
```

Expected startup output:
```
INFO  | api.server | Initialising database...
INFO  | api.server | Loading face recognition model...
INFO  | api.server | Model ready — buffalo_l loaded
INFO  | uvicorn.error | Application startup complete.
INFO  | uvicorn.error | Uvicorn running on http://127.0.0.1:8000
```

**Terminal 2 — Frontend static server:**
```bash
cd frontend
python -m http.server 8080
```

**Open in browser:**
```
http://127.0.0.1:8080/index.html
```

### Verifying the Setup

```bash
# Check API health
curl http://127.0.0.1:8000/api/health
# Expected: {"status":"ok","service":"smart-attendance-api","model_ready":true}

# Check database tables
sqlite3 attendance.db ".tables"
# Expected: attendance  face_embeddings  users
```

### Common Issues

| Issue | Likely Cause | Fix |
|---|---|---|
| `ModelNotReadyError` on scan | Model still loading after start | Wait 10–20 seconds, retry |
| `libGL.so.1: cannot open` | Missing X11 library on headless Linux | `sudo apt install libgl1-mesa-glx` |
| `No module named 'mediapipe'` | Install failed silently | `pip install mediapipe==0.10.14` |
| Camera permission denied | Browser blocked webcam access | Allow camera in browser settings; must use `localhost` or HTTPS |
| Low confidence scores (< 0.55) | Poor lighting or extreme angle | Use good frontal lighting; face squarely inside the oval guide |
| `ONNX Runtime error` on load | Architecture / version mismatch | Pin to `onnxruntime==1.17.0` in requirements |
| `database is locked` | Concurrent write attempt | Single-user only on SQLite; restart server |

---

## 14. Performance Characteristics & Scalability

### Timing Profile (CPU-only, Intel i5/i7-class)

| Operation | Typical Time | Scaling |
|---|---|---|
| Base64 decode + OpenCV imdecode | ~5 ms | Fixed cost |
| MediaPipe BlazeFace detection | ~10–20 ms | Fixed cost |
| Face crop + bilinear resize | ~1 ms | Fixed cost |
| ArcFace ONNX inference (ResNet-50) | ~200–400 ms | Fixed cost (CPU) |
| SQLite load all embeddings | ~1–50 ms | Scales with N embeddings |
| Cosine similarity scan | ~0.1 ms × N | Scales with N embeddings |
| SQLite write attendance record | ~2 ms | Fixed cost |

### End-to-End Response Time by Scale

| Registered Users | Embeddings (×5) | Expected Response Time | User Experience |
|---|---|---|---|
| 10 | 50 | 220–430 ms | Excellent |
| 50 | 250 | 230–440 ms | Excellent |
| 100 | 500 | 240–460 ms | Excellent |
| 300 | 1,500 | 300–600 ms | Good (~1 second) |
| 1,000 | 5,000 | 500 ms – 1.5 s | Acceptable |
| 5,000 | 25,000 | 1.5–5 s | Poor |
| 10,000 | 50,000 | 3–10 s | Unacceptable |
| 50,000 | 250,000 | 15–60 s | Completely unusable |

The numbers above assume 5 stored embeddings per user (the default registration capture count).

### Why It Degrades: The O(N²) Wall Explained

The matching algorithm is a **brute-force linear scan**:

```python
for user_id, name, stored_emb in all_embeddings:   # N iterations
    sim = np.dot(query_emb, stored_emb)             # D = 512 multiplications
```

**Pure compute cost** for the dot products scales as O(N × D) and is actually manageable — even at 50,000 embeddings, the NumPy dot products take only ~300 ms.

The real killer is the **SQLite full table scan** that precedes it:

```sql
SELECT fe.user_id, u.name, fe.embedding
FROM face_embeddings fe
JOIN users u ON fe.user_id = u.id
```

This is an unfiltered read of the entire `face_embeddings` table on every single scan request. For N embeddings:

- **Data volume**: N × 2,048 bytes = 2 KB per embedding
  - 1,000 embeddings → 2 MB read per query
  - 10,000 embeddings → 20 MB read per query
  - 50,000 embeddings → 100 MB read per query
- **SQLite page misses**: At large N, the working set exceeds SQLite's page cache, causing disk I/O on every query
- **Python object allocation**: Every embedding is deserialized from raw bytes into a Python object and NumPy array — O(N) allocations per query

This is why response time does not grow linearly with N: at small N everything fits in the OS page cache (fast); at large N cache misses dominate and the system slows down disproportionately.

Additionally, at registration time, if a user registers with 5 face images, those 5 embeddings must all be compared on every subsequent scan — the effective N is `users × embeddings_per_user`, making it grow as O(users²) in practice if per-user embedding counts are also increasing.

**The honest numbers for this prototype:**

- Comfortable operating range: **≤ 300 users** (sub-1-second response)
- Stretching it: **300–1,000 users** (1–3 seconds, still usable)
- Breaking point: **> 1,000 users** (needs architectural changes)

### The Path to Scale (Not Yet Implemented)

**Short-term fix — in-memory embedding matrix (10,000 users, < 50 ms):**

Load all embeddings once at startup into a single NumPy matrix:
```python
# At startup: (N, 512) matrix loaded once
embeddings_matrix = np.stack([emb for _, _, emb in db.get_all_embeddings()])

# At query time: single vectorized BLAS operation
similarities = embeddings_matrix @ query_emb   # O(N) but single call, BLAS-optimized
best_idx = np.argmax(similarities)
```

Invalidate and reload on user CRUD. This eliminates the per-query SQLite load entirely and reduces matching to a single matrix multiplication — sub-50 ms for 10,000 users on CPU.

**Medium-term — FAISS ANN index (1,000,000 users, < 5 ms):**

Facebook AI Similarity Search (FAISS) builds approximate nearest neighbor indices that answer "top-K most similar embeddings" in O(log N) instead of O(N):
```python
import faiss
index = faiss.IndexFlatIP(512)    # Inner product (≡ cosine for normalized vectors)
index.add(embeddings_matrix)
D, I = index.search(query_emb.reshape(1, -1), k=1)  # Single query, < 5 ms for 1M vectors
```

**Long-term — pgvector (production, millions of users):**

PostgreSQL + `pgvector` extension provides native vector similarity with HNSW indexing, ACID guarantees, and concurrent write support — replacing both SQLite and the in-memory cache.

---

## 15. Current Limitations

This is a **functional local prototype** and is not production-ready. Known limitations are documented here transparently.

### 1. No Anti-Spoofing / Liveness Detection

**Severity: High for production; Low for controlled environments**

The current system cannot distinguish a real face from a high-quality photograph, screen-displayed image, or printed photo. An attacker could mark someone else's attendance by holding their photo in front of the camera.

Production systems address this with:
- **Passive liveness**: Texture analysis (skin reflectivity vs. printed paper)
- **Active liveness**: Eye blink challenge, head movement request
- **Depth sensing**: Infrared structured-light cameras (like Apple Face ID)

### 2. SQLite Is Not Concurrent-Write Safe

**Severity: Medium**

SQLite uses file-level locking. Simultaneous scan requests (two people at two terminals scanning at the same time) will cause one request to block or throw `database is locked`.

For a single terminal with one user at a time, this never occurs. For multi-terminal deployments, migrate to PostgreSQL.

### 3. No Authentication or Authorization

**Severity: High for any networked deployment**

All API endpoints are completely unauthenticated. Any machine on the same network can:
- Register, delete, or list users
- Read all attendance records
- Call the scan endpoint
- View system logs

### 4. Only One Face Processed Per Frame

**Severity: Medium**

When multiple people stand in front of the camera simultaneously, only the person with the largest bounding box is processed. All others are silently ignored. This prevents group check-ins.

### 5. No Landmark-Based Face Alignment

**Severity: Low to Medium**

Simple crop + resize (no geometric face warping). Faces at steep angles (>30° yaw, >20° pitch) produce embeddings that diverge from the training distribution of ArcFace, reducing match scores. Users with extreme head tilts may get `no_match` even when registered.

### 6. HTTP Only (No HTTPS in Development)

**Severity: Low for localhost; High for LAN deployment**

`getUserMedia` (webcam access) is restricted to secure origins by modern browsers. On `localhost` this is exempted, but deploying to any other address (even `192.168.x.x`) will block camera access without TLS certificates.

### 7. No Data Export or Backup

**Severity: Medium**

No mechanism to export attendance data to CSV/Excel, schedule database backups, or integrate with external student information systems (SIS).

### 8. One Attendance Per Calendar Day (Fixed Policy)

**Severity: Medium for multi-session scenarios**

The system enforces exactly one attendance marking per user per day. This is unsuitable for multi-period classes, check-in/check-out scenarios, or organizations with multiple daily sessions.

### 9. No Enrollment Quality Scoring

**Severity: Low to Medium**

When a user registers with poor-quality images (blurry, bad lighting, extreme angle), the stored embeddings are weak. The system provides no feedback on enrollment quality, storing whatever embeddings it can extract. Poor enrollment leads to future recognition failures.

### 10. Model Auto-Download Requires Internet at First Start

**Severity: Low but noteworthy**

The InsightFace `buffalo_l` model (~170 MB) auto-downloads from the InsightFace CDN on first use. Air-gapped machines or networks with content filtering must manually provision the model file at `~/.insightface/models/buffalo_l/`.

---

## 16. Future Perspectives & Roadmap

### Short-Term: v0.2 — Infrastructure Hardening

*Goal: Make the system safe and reliable for a single classroom or small office.*

- [ ] **In-memory embedding cache** — Load all embeddings into a NumPy matrix at startup; refresh on CRUD. Drops scan latency from ~300 ms to ~30 ms for up to 10,000 users.
- [ ] **HTTPS with mkcert** — Local TLS certificates for LAN deployment without browser warnings.
- [ ] **JWT authentication** — Admin login, access tokens, protected write endpoints.
- [ ] **SQLite WAL mode** — Write-Ahead Logging for concurrent read safety (partial fix for concurrency).
- [ ] **CSV/Excel data export** — Date-range filtered attendance export.
- [ ] **Enrollment quality scoring** — Reject blurry or low-confidence registration images with user feedback.
- [ ] **Per-user embedding deduplication** — Detect and reject near-identical embeddings at registration.

### Medium-Term: v0.5 — Scalability & Accuracy

*Goal: Support 500–10,000 users with sub-second scan times.*

- [ ] **FAISS ANN index** — Replace linear scan with IVFFlat or HNSW approximate nearest neighbor. Expected: < 5 ms matching for 100,000 embeddings.
- [ ] **5-point landmark alignment** — Use InsightFace's built-in landmark detector to warp faces to canonical pose. Expected: 10–15% improvement in match rate for off-angle faces.
- [ ] **Multi-face per frame** — Process all detected faces in a single scan; batch-mark attendance.
- [ ] **GPU ONNX inference** — `onnxruntime-gpu` on NVIDIA hardware drops ArcFace inference from ~300 ms to ~20 ms.
- [ ] **PostgreSQL migration** — Replace SQLite with PostgreSQL + `asyncpg`. Required for concurrent multi-terminal deployments.
- [ ] **Passive liveness detection** — Lightweight anti-spoofing model (e.g., MiniVisionNet) to reject flat photos.

### Long-Term: v1.0 — Enterprise-Grade System

*Goal: Full institutional attendance management platform.*

- [ ] **Active liveness detection** — Eye blink / head turn challenge-response before recognition.
- [ ] **Multi-session attendance** — Configurable attendance windows per day (lecture 1, lecture 2, lab, etc.).
- [ ] **Department / class grouping** — Users organized into groups; per-group attendance reports and statistics.
- [ ] **Native mobile app** — iOS + Android app (React Native or Flutter) with offline sync capability.
- [ ] **Push notifications** — Email / SMS / mobile push alerts for absentees, late arrivals, low attendance rate warnings.
- [ ] **SIS integration** — REST webhooks or direct connectors for Google Classroom, Moodle, Microsoft Teams, SAP ERP.
- [ ] **Docker containerization** — `docker-compose.yml` for one-command local deployment; Helm chart for Kubernetes.
- [ ] **Edge deployment** — ARM-optimized ONNX model for Raspberry Pi 4+; eliminates laptop requirement.
- [ ] **Admin dashboard** — Role-based web panel for user management, batch operations, health monitoring.
- [ ] **Audit trail** — Immutable, append-only log of all administrative actions (who registered whom, who deleted records).
- [ ] **Automated re-enrollment prompts** — Detect embedding drift over time and prompt users to re-register.
- [ ] **Demographic fairness auditing** — Measure and report recognition accuracy across demographic groups.

### Research Directions

This project is a platform for ongoing research:

- **Cross-age face recognition** — How does ArcFace matching degrade as registered users' appearances change across months and years?
- **Low-resource face recognition** — Can a MobileNet backbone (vs. ResNet-50) deliver acceptable accuracy with 10× faster inference on embedded hardware?
- **Privacy-preserving matching** — Can secure multi-party computation or homomorphic encryption allow embedding matching without decrypting stored biometric data?
- **Demographic bias** — Does ArcFace's w600k_r50 model perform equally well across different skin tones, genders, and age groups? (Known open research question for ArcFace.)
- **Continual learning** — Can the system improve its recognition model on-device over time without sending biometric data to a central server (federated learning)?

---

## 17. Contributing

This project is an open local prototype under active development. Contributions, issue reports, and ideas are welcome.

### Reporting Issues

Open an issue with:
- OS name and Python version
- Exact steps to reproduce
- Expected vs. actual behavior
- Relevant log lines from `logs/attendance.log`

### Development Setup

```bash
git clone <your-fork-url>
cd Attendence
git checkout -b feature/your-feature-name

python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# API with hot reload
uvicorn api.server:app --reload --host 127.0.0.1 --port 8000

# Frontend
cd frontend && python -m http.server 8080
```

### Code Style

- **Python**: PEP 8; type hints on all public function signatures
- **JavaScript**: ES6+ vanilla; `const`/`let` only; no frameworks
- **SQL**: Uppercase keywords; explicit column names (no `SELECT *`)
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `docs:`, `perf:`)

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **ArcFace** | Face recognition loss function that maximizes angular margin between face identity clusters in embedding space |
| **BlazeFace** | Google's lightweight face detection model designed for mobile (CPU) inference |
| **Cosine Similarity** | Dot product of two L2-normalized vectors; measures the angle between them, independent of magnitude |
| **Embedding** | A dense, fixed-length numerical vector representing a data point in a learned high-dimensional feature space |
| **FAR** | False Accept Rate — probability of incorrectly granting access to an impostor |
| **FRR** | False Reject Rate — probability of incorrectly denying access to a legitimate user |
| **Glassmorphism** | UI design trend using translucent surfaces with backdrop blur over dark gradient backgrounds |
| **InsightFace** | Open-source Python library providing state-of-the-art face analysis via ArcFace models in ONNX format |
| **L2 Normalization** | Scaling a vector so its Euclidean (L2) norm equals 1.0; required before cosine similarity |
| **Liveness Detection** | The task of distinguishing a real, live face from a spoofed representation (photo, screen, mask) |
| **MediaPipe** | Google's cross-platform ML framework for perception tasks including face detection, pose, hands |
| **ONNX** | Open Neural Network Exchange — an open format for interoperable ML model storage and inference |
| **ONNX Runtime** | Cross-platform C++ inference engine for ONNX models; supports CPU, CUDA, and many accelerators |
| **Pydantic** | Python data validation and settings library built on type hints; used for FastAPI request/response schemas |
| **SQLite** | Serverless, file-based relational database engine; the entire database is a single `.db` file |
| **Uvicorn** | ASGI (Asynchronous Server Gateway Interface) server for Python; powers FastAPI in production |
| **WebRTC** | W3C/IETF web standard for real-time audio and video communication in browser applications |

---

## Appendix B: Model Cards

### ArcFace w600k_r50 (InsightFace buffalo_l)

| Property | Value |
|---|---|
| Architecture | ResNet-50 with ArcFace loss |
| Training data | ~600,000 identities (WebFace600K) |
| Input size | 112 × 112 pixels, BGR channel order |
| Output | 512-dimensional L2-normalized embedding |
| File format | ONNX (`.onnx`) |
| File size | ~170 MB |
| LFW 1:1 verification accuracy | 99.83% |
| IJB-C TAR @ FAR = 1e-4 | 97.2% |
| Auto-download path | `~/.insightface/models/buffalo_l/w600k_r50.onnx` |

### MediaPipe BlazeFace (Short-Range Model)

| Property | Value |
|---|---|
| Architecture | Modified MobileNetV1 |
| Internal input size | 128 × 128 pixels |
| Detection range | Up to ~2 metres (short-range model) |
| Inference time (CPU) | 5–15 ms |
| Output | Bounding box `[x1, y1, x2, y2]` + 6 facial keypoints |
| Confidence threshold used | 0.5 |

---

*All face data remains on your machine. No embeddings, images, or attendance records are transmitted to any external server.*
