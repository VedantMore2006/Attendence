# Smart Attendance System

Real-time face recognition attendance system built with OpenCV, MediaPipe BlazeFace, ArcFace (InsightFace), SQLite, and Streamlit.

This project performs:
- live face detection from webcam
- face alignment and embedding extraction
- identity matching against stored embeddings
- once-per-day attendance marking with duplicate prevention
- dashboard-based attendance viewing and CSV export

## Features

- Real-time webcam recognition pipeline
- Multi-embedding user registration (default 10 embeddings)
- Cosine-similarity matching with configurable threshold
- SQLite persistence for users, embeddings, and attendance
- Daily duplicate prevention via attendance rules
- Runtime stabilization:
  - largest-face-only processing
  - frame interval processing
  - short-term matching cache
  - 1-second identity persistence before marking attendance
- Streamlit dashboard for users, attendance, and exports

## Project Structure

```text
Attendence/
├── main.py
├── attendance.db
├── README.md
├── database_cheatsheet.md
├── api/
│   └── routes.py
├── attendance/
│   ├── attendance_service.py
│   └── register_user.py
├── camera/
│   └── camera_stream.py
├── dashboard/
│   └── app.py
├── database/
│   ├── db.py
│   └── models.py
├── recognition/
│   └── matcher.py
├── utils/
│   └── config.py
└── vision/
    ├── aligner.py
    ├── detector.py
    └── embedder.py
```

## Tech Stack

- Python 3.10+
- OpenCV
- MediaPipe (BlazeFace)
- InsightFace ArcFace
- ONNX Runtime
- SQLite
- Streamlit
- Pandas

## Requirements

Your current `requirements.txt` includes core CV/backend packages. For full project usage (dashboard included), ensure these are installed:

```bash
pip install -r requirements.txt
pip install streamlit pandas
```

Recommended `requirements.txt` additions for dashboard support:
- `streamlit`
- `pandas`

## Environment Setup

### 1. Clone/Open Project

```bash
cd /home/vedant/Attendence
```

### 2. Create and Activate Environment

Conda example:

```bash
conda create -n attendence python=3.10 -y
conda activate attendence
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
pip install streamlit pandas
```

## Run the Main Attendance System

```bash
python main.py
```

### What Happens at Startup

1. Connects to `attendance.db`
2. Ensures required tables exist (`users`, `face_embeddings`, `attendance`)
3. Starts camera at index `2`
4. Performs warmup frame reads
5. Prompts:

```text
Enter new user name to register (or press Enter to skip):
```

6. If name is provided:
   - shows 3-second countdown
   - captures embeddings
   - stores user + embeddings in DB
7. Loads all stored embeddings into matcher
8. Starts recognition loop and attendance marking

## Registration Flow

Implemented in `attendance/register_user.py`.

Default behavior:
- `max_embeddings=10`
- `capture_time=30` seconds
- short pause between captures to improve variation

Registration works best when the user:
- faces camera directly
- slightly changes expression/angle
- stays within frame during capture

## Recognition + Attendance Logic

Implemented in `main.py` using:
- `vision/detector.py`
- `vision/aligner.py`
- `vision/embedder.py`
- `recognition/matcher.py`
- `attendance/attendance_service.py`

### Stabilization Controls

- `PERSISTENCE_TIME = 1.0`
  - identity must remain stable for 1 second before attendance marking
- `DETECTION_INTERVAL = 3`
  - heavy embedding/matching runs every 3rd frame
- `CACHE_TIME = 0.5`
  - reuses recent match briefly to reduce redundant matching
- largest face only
  - reduces background false detections

### Attendance Labels

- `Name (Hold Still 0.xs)`
- `Name (Attendance Marked)`
- `Name (Already Marked)`
- `Unknown`
- `Face Not Clear`
- `Embedding Failed`

## Database Schema

Created automatically by `database/models.py`.

### users
- `id` INTEGER PRIMARY KEY
- `name` TEXT
- `created_at` TIMESTAMP

### face_embeddings
- `id` INTEGER PRIMARY KEY
- `user_id` INTEGER (FK users.id)
- `embedding` BLOB (float32 vector bytes)

### attendance
- `id` INTEGER PRIMARY KEY
- `user_id` INTEGER (FK users.id)
- `date` TEXT (ISO date)
- `time` TEXT (HH:MM:SS)

## Dashboard

Run:

```bash
streamlit run dashboard/app.py
```

Dashboard sections:
- Register User (placeholder; registration runs through `main.py`)
- Users table
- Attendance table
- Export CSV report

## Export Report

From dashboard `Export` menu:
- Downloads `attendance_report.csv`
- Columns: `name, date, time`

## Tuning Guide

If recognition appears slow or too strict:
- lower `DETECTION_INTERVAL` from `3` to `2`
- lower `PERSISTENCE_TIME` from `1.0` to `0.7`
- lower matcher threshold in `recognition/matcher.py` from `0.55` to `0.50`

If false positives increase:
- raise matcher threshold to `0.60`
- keep `PERSISTENCE_TIME` at `1.0` or higher

## Common Issues and Fixes

### 1. Stuck on "Processing..."

This usually means frame skipping is active and heavy recognition runs every N frames.

Fix/tune:
- set `DETECTION_INTERVAL = 2` in `main.py`

### 2. Camera not opening

- confirm camera index (project defaults to `2`)
- test alternate indexes in `camera/camera_stream.py` (`0`, `1`, `2`)

### 3. CUDA provider warning in ONNX Runtime

Current setup uses CPU fallback. This is expected unless CUDA runtime is installed and configured.

### 4. Qt font/style warnings

These are non-fatal UI warnings from OpenCV Qt backend and do not block recognition.

### 5. Embedding failed

Can happen with poor crop/pose/blur. Improve lighting, keep face centered, and avoid fast motion.

## Useful Files

- Main pipeline: `main.py`
- Registration module: `attendance/register_user.py`
- Attendance rules: `attendance/attendance_service.py`
- Matcher: `recognition/matcher.py`
- DB layer: `database/db.py`, `database/models.py`
- Dashboard: `dashboard/app.py`
- DB operations cheat sheet: `database_cheatsheet.md`

## Quick Start (Minimal)

```bash
cd /home/vedant/Attendence
conda activate attendence
pip install -r requirements.txt
pip install streamlit pandas
python main.py
```

Dashboard in another terminal:

```bash
conda activate attendence
streamlit run dashboard/app.py
```

## Roadmap Status (Implemented)

- Camera streaming
- Face detection (BlazeFace)
- Face alignment/crop
- ArcFace embeddings
- Face matching (multi-embedding)
- SQLite persistence
- Registration workflow
- Attendance marking with duplicate prevention
- Runtime stabilization
- Dashboard + CSV export

## Next Suggested Enhancements

- API endpoints in `api/routes.py`
- User delete/edit controls in dashboard
- Attendance filters by date range
- Liveness checks for anti-spoofing
- Optional tracking (KCF) for further CPU reduction
