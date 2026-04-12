# System Design: Smart Attendance System

## 1. Purpose and Scope

This document describes the engineering design of the Smart Attendance System (SAS), a local-first biometric attendance platform using face recognition. It covers architecture, data flow, recognition pipeline, API behavior, performance, and design trade-offs.

## 2. System Context

SAS is designed for:
- Single-machine deployment
- Webcam-based attendance capture
- Local data processing and storage
- Low operational complexity (no cloud services, no frontend build pipeline)

## 3. Architecture Overview

```text
+--------------------------------------------------------------+
| Browser Client                                                |
| - index.html / scan.html / register.html / stats.html       |
| - api.js (HTTP client), app.js (page logic)                 |
+------------------------------+-------------------------------+
                               |
                               | HTTP/JSON
                               v
+--------------------------------------------------------------+
| FastAPI Backend (api/server.py, api/routes.py, api/errors.py)|
| - Request validation and routing                             |
| - Image decode and inference orchestration                   |
| - Attendance decisions and response shaping                  |
+--------------------------+------------------+----------------+
                           |                  |
                           v                  v
+-----------------------------+   +-----------------------------+
| Vision Pipeline             |   | Data Layer (SQLite)         |
| - detector.py (MediaPipe)   |   | - users                     |
| - aligner.py (crop/resize)  |   | - face_embeddings           |
| - embedder.py (ArcFace)     |   | - attendance                |
+-----------------------------+   +-----------------------------+
```

## 4. Runtime Request Flow (Scan)

```text
Client -> POST /api/attendance/scan (base64 image)
  Backend:
    1) Decode base64 -> OpenCV frame (BGR)
    2) Detect faces (MediaPipe BlazeFace)
    3) Select largest face (single-subject terminal assumption)
    4) Align face (crop + resize to 112x112)
    5) Extract embedding (ArcFace, 512-d, L2-normalized)
    6) Fetch stored embeddings from SQLite
    7) Compute cosine similarity against all stored embeddings
    8) If best score >= threshold (0.55): identify user
    9) Mark attendance (one record per user per day)
   10) Return structured scan response
```

## 5. Component Design

### 5.1 API Layer

Primary modules:
- `api/server.py`: app startup, model readiness, logging setup
- `api/routes.py`: endpoint handlers, pipeline integration, matching logic
- `api/errors.py`: domain-specific exceptions and global handlers

Primary responsibilities:
- Request/response schema handling
- Image payload validation and decode
- Vision pipeline invocation
- Database interaction orchestration
- Error normalization and status-code mapping

### 5.2 Vision Layer

#### Face Detection (`vision/detector.py`)
- Engine: MediaPipe BlazeFace
- Configuration: `model_selection=0`, `min_detection_confidence=0.5`
- Input: RGB frame
- Output: list of `[x1, y1, x2, y2]` bounding boxes

Why selected:
- Fast on CPU
- Stable short-range detection
- No GPU dependency

#### Face Alignment (`vision/aligner.py`)
- Current implementation: crop and resize to `112x112`
- Input: BGR frame + selected bounding box
- Output: resized face image

Trade-off:
- Fast and simple
- Less robust than landmark-based warping for large pose variation

#### Face Embedding (`vision/embedder.py`)
- Engine: InsightFace FaceAnalysis (`buffalo_l`)
- Model: ArcFace (`w600k_r50.onnx`)
- Output: `512`-dimensional vector
- Post-processing: L2 normalization

Inference characteristics:
- CPU-compatible via ONNX Runtime
- Typical inference cost dominates scan latency

### 5.3 Business Logic Layer

`attendance/attendance_service.py` enforces attendance policy:
- One attendance event per user per calendar day
- Duplicate scan on same day returns `already_marked`
- Successful first scan returns `marked`

### 5.4 Data Layer

`database/models.py` manages schema and CRUD operations.

Schema:

```sql
CREATE TABLE users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE face_embeddings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL,
    embedding BLOB NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE attendance (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date    TEXT NOT NULL,
    time    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Embedding storage:
- Data type: float32 array serialized to BLOB (`embedding.tobytes()`)
- Size: `512 * 4 = 2048` bytes per embedding

## 6. Matching Logic

### 6.1 Similarity Metric

With normalized vectors, cosine similarity reduces to dot product:

```text
sim(a, b) = a . b
```

Decision threshold:
- Match accepted when `best_similarity >= 0.55`

### 6.2 Matching Procedure

```python
best_score = -1.0
best_user = None

for each stored_embedding in db:
    score = dot(query_embedding, stored_embedding)
    if score > best_score:
        best_score = score
        best_user = user

if best_score >= 0.55:
    return MATCH(best_user, best_score)
return NO_MATCH(best_score)
```

Properties:
- Deterministic top-1 match
- Brute-force search across all stored vectors
- Complexity: `O(N * D)` where `N=embeddings`, `D=512`

## 7. API Behavior Summary

Base URL: `http://127.0.0.1:8000`

Key endpoints:
- `GET /api/health`
- `POST /api/users`
- `GET /api/users`
- `DELETE /api/users/{user_id}`
- `POST /api/attendance/scan`
- `POST /api/attendance/mark`
- `GET /api/attendance`
- `GET /api/stats/today`
- `GET /api/logs/recent`

Typical scan responses:
- `marked`
- `already_marked`
- `no_face`
- `no_match`

Error mapping includes:
- Image decode failures
- Embedding extraction failures
- Model not-ready conditions
- Database operation errors

## 8. Logging Design

Configuration:
- Console + rotating file logging
- File: `logs/attendance.log`
- Rotation: `5 MB`, `backupCount=3`

Structured scan event format includes:
- timestamp
- result
- user
- user_id
- confidence

Log parsing endpoint (`/api/logs/recent`) extracts last scan events for UI display.

## 9. Performance and Scalability

### 9.1 Typical CPU Timing

- Decode and image prep: ~5 ms
- Face detection: ~10-20 ms
- Crop and resize: ~1 ms
- ArcFace inference: ~200-400 ms
- DB load + linear match: scales with number of embeddings

Observed scan latency (prototype scale):
- ~300-700 ms per scan on CPU

### 9.2 Bottleneck Analysis

Current bottleneck at larger scale is repeated full-table embedding reads per scan:

```sql
SELECT fe.user_id, u.name, fe.embedding
FROM face_embeddings fe
JOIN users u ON fe.user_id = u.id;
```

Implications:
- Read volume grows linearly with `N`
- Additional deserialization overhead in Python
- Performance degrades significantly beyond low-thousands of users

### 9.3 Scalability Strategy

Near-term optimization path:
1. In-memory embedding matrix cache
2. Vectorized similarity (`matrix @ query_vector`)
3. Cache refresh on user/embedding CRUD

Medium-term optimization path:
1. ANN index (e.g., FAISS)
2. Top-k nearest neighbor retrieval
3. Reduced query time at large `N`

Long-term production path:
1. Move to PostgreSQL + vector indexing (`pgvector`)
2. Add concurrent-safe multi-terminal operation

## 10. Design Trade-offs

1. SQLite chosen for simplicity and portability over write concurrency.
2. MediaPipe chosen for fast CPU detection over heavier detectors.
3. Crop-resize alignment chosen for speed over pose robustness.
4. Brute-force matching chosen for implementation simplicity over large-scale efficiency.
5. Vanilla JS frontend chosen for zero-build deployment over framework-level abstractions.

## 11. Security and Privacy Posture

Current prototype properties:
- Local execution and local biometric storage
- No cloud transmission of face embeddings by default

Known gaps:
- No authentication/authorization on API endpoints
- No liveness detection (photo/screen spoofing risk)
- HTTP in development (no TLS for non-localhost usage)

## 12. Current Limitations

- No anti-spoofing/liveness checks
- One-face processing policy (largest face only)
- No landmark-based alignment
- SQLite write-lock risk in concurrent multi-terminal scenarios
- No built-in data export/backup workflow
- Fixed attendance policy (one mark per user per day)
- Enrollment quality not automatically scored

## 13. Roadmap Alignment

Engineering roadmap priorities:
1. In-memory embedding cache and vectorized matching
2. Authentication and secure deployment posture
3. Improved alignment and liveness pipeline
4. Scalable vector search and database migration path

## 14. Deployment Summary

Local run profile:
- API: `uvicorn api.server:app --reload --host 127.0.0.1 --port 8000`
- Frontend: static server on `127.0.0.1:8080`
- Model download on first run (`buffalo_l`) required once

This architecture delivers a practical, auditable, local-first biometric attendance pipeline suitable for prototype and controlled deployment scenarios.
