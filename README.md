# Smart Attendance System

AI-powered biometric attendance using real-time face recognition on a local machine.

Smart Attendance System (SAS) replaces manual registers, cards, and PIN terminals with fast, camera-based identity verification. The full pipeline runs locally: no cloud dependency, no external biometric transfer, and no proprietary hardware lock-in.

## Why It Matters

Traditional attendance methods authenticate tokens (card, PIN, phone), not the actual person. This project authenticates the person directly using face embeddings, reducing proxy attendance and manual overhead.

## What It Does

- Real-time attendance scan from webcam input
- Face detection, alignment, and embedding extraction on CPU
- Identity matching with cosine similarity
- Automatic daily attendance marking with duplicate prevention
- User registration with multiple face samples
- Attendance records, daily stats, and recent scan logs

## Core Features

- Local-first deployment (FastAPI + SQLite + static frontend)
- ArcFace embeddings via InsightFace (`buffalo_l`)
- MediaPipe BlazeFace detection for fast CPU inference
- Structured rotating logs (`logs/attendance.log`)
- Clean browser-based UI (no frontend build step)

## High-Level Architecture

```text
Browser (HTML/CSS/JS)
  -> API calls (HTTP/JSON)
FastAPI Backend
  -> Vision Pipeline
     - detector.py (MediaPipe)
     - aligner.py (112x112 crop/resize)
     - embedder.py (ArcFace 512-d embedding)
  -> Attendance Service
  -> SQLite Database
     - users
     - face_embeddings
     - attendance
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS, WebRTC |
| Backend | Python 3.10+, FastAPI, Uvicorn, Pydantic |
| Vision | MediaPipe, InsightFace (ArcFace), ONNX Runtime, OpenCV, NumPy |
| Data | SQLite3 |
| Utilities | python-dotenv, python-dateutil, python-multipart |

## Quick Start

```bash
# 1) Create environment
python3.10 -m venv .venv
source .venv/bin/activate

# 2) Install dependencies
pip install -r requirements.txt

# 3) Start API
uvicorn api.server:app --reload --host 127.0.0.1 --port 8000

# 4) Start frontend (new terminal)
cd frontend
python -m http.server 8080
```

Open: `http://127.0.0.1:8080/index.html`

## API Entry Points

- `GET /api/health`
- `POST /api/users`
- `GET /api/users`
- `DELETE /api/users/{user_id}`
- `POST /api/attendance/scan`
- `GET /api/attendance`
- `GET /api/stats/today`
- `GET /api/logs/recent`

## Documentation Map

- `SYSTEM_DESIGN.md`: engineering architecture, pipeline internals, matching logic, trade-offs, performance
- `REPORT_SOURCE.md`: formal academic report source with methodology and analysis
- `GLOSSARY.md`: term definitions

## Current Status

Functional local prototype with verified end-to-end flow. Best suited for single-terminal deployments and small to medium user sets.

## License and Contribution

Open-source project under active development. Contributions are welcome via issues and pull requests.
