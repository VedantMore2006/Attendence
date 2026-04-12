# Smart Attendance System

AI-powered biometric attendance using real-time face recognition on a local machine.

Smart Attendance System (SAS) replaces manual registers, cards, and PIN terminals with fast, camera-based identity verification. The full pipeline runs locally: no cloud dependency, no external biometric transfer, and no proprietary hardware lock-in.

## Demo Video

Watch the system flow directly from this repository:

<video src="./demo.mp4" controls width="920">
  Your browser does not support embedded video playback.
</video>

## Why It Matters

Traditional attendance methods authenticate tokens (card, PIN, phone), not the actual person. This project authenticates the person directly using face embeddings, reducing proxy attendance and manual overhead.

## What It Does

- Real-time attendance scan from webcam input
- Face detection, alignment, and embedding extraction on CPU
- Identity matching with cosine similarity
- Automatic daily attendance marking with duplicate prevention
- Check-in and check-out workflow from the same scan endpoint
- User registration with multiple face samples
- Attendance records, daily stats, and recent scan logs

## Core Features

- Local-first deployment (FastAPI + SQLite + static frontend)
- ArcFace embeddings via InsightFace (buffalo_l model pack)
- MediaPipe BlazeFace detection for fast CPU inference
- Structured rotating logs at logs/attendance.log
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
| Utilities | python-dotenv, python-dateutil, python-multipart, requests |

## Setup Guide

### 1) Prerequisites

- Python 3.10 or newer
- pip
- Webcam connected and accessible
- Linux/macOS/Windows terminal access

### 2) Create and activate environment

Option A (Conda):

```bash
conda create -n project_env python=3.10 -y
conda activate project_env
```

Option B (venv):

```bash
python3.10 -m venv .venv
source .venv/bin/activate
```

### 3) Install dependencies

```bash
pip install -r requirements.txt
```

### 4) Start the backend API

```bash
uvicorn api.server:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

Note: on the first run, InsightFace may download model files. Startup can take longer the first time.

### 5) Start the frontend (new terminal)

```bash
cd frontend
python -m http.server 8080
```

Open this in your browser:

- http://127.0.0.1:8080/index.html

## How To Use

1. Open the app home page.
2. Register one or more users with multiple face captures.
3. Go to the scan page and scan a registered face.
4. First successful scan marks check-in.
5. Next successful scan for the same user on the same day records check-out.
6. Review attendance, stats, and recent logs from the UI pages.

## API Entry Points

- GET /api/health
- POST /api/users
- GET /api/users
- DELETE /api/users/{user_id}
- POST /api/attendance/mark
- POST /api/attendance/scan
- GET /api/attendance
- GET /api/stats/today
- GET /api/logs/recent

## Project Files You Will Use Most

- api/server.py: FastAPI app startup, logging, model initialization
- api/routes.py: API endpoints and scan pipeline orchestration
- database/models.py: SQLite schema and persistence layer
- vision/detector.py: face detection
- vision/aligner.py: face alignment
- vision/embedder.py: ArcFace embeddings
- frontend/index.html: main entry page
- frontend/api.js: frontend API calls

## Data and Logs

- SQLite database file: attendance.db
- Rotating application log: logs/attendance.log

## Troubleshooting

- If /api/health shows model_ready as false:
  - confirm requirements installed in the active environment
  - restart the API after installation
  - check logs/attendance.log for model loading errors
- If camera access fails in browser:
  - use localhost or 127.0.0.1
  - allow camera permission in browser settings
- If no match is found often:
  - re-register users with clearer lighting and frontal face samples

## Documentation Map

- SYSTEM_DESIGN.md: engineering architecture, pipeline internals, matching logic, trade-offs, performance
- REPORT_SOURCE.md: formal academic report source with methodology and analysis
- GLOSSARY.md: term definitions

## Current Status

Functional local prototype with verified end-to-end flow. Best suited for single-terminal deployments and small to medium user sets.

## License and Contribution

Open-source project under active development. Contributions are welcome via issues and pull requests.
