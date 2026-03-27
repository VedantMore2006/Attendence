# Smart Attendance System

Real-time face recognition attendance system built with OpenCV, MediaPipe BlazeFace, ArcFace (InsightFace), SQLite, and Streamlit.

This prototype now includes a FastAPI backend so the frontend can connect over HTTP instead of reading SQLite directly.

The system performs:
- live face detection from webcam
- face alignment and embedding extraction
- identity matching against stored embeddings
- once-per-day attendance marking
- dashboard-based attendance viewing and CSV export

## 1. Project Structure

```text
Attendence/
├── main.py
├── requirements.txt
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

## 2. Requirements

- Python 3.10 or newer
- Webcam
- ArcFace model file at:
  - `~/.insightface/models/buffalo_l/w600k_r50.onnx`

Install Python packages:

```bash
pip install -r requirements.txt
```

## 3. Cross-Platform Notes (Linux and Windows)

This project currently sets:

```python
os.environ["QT_QPA_PLATFORM"] = "xcb"
```

in:
- `main.py`
- `camera/camera_stream.py`

Important:
- `xcb` is a Linux Qt platform plugin.
- On Linux, this can help OpenCV Qt window behavior.
- On Windows, `xcb` has no meaning and may cause startup issues.

For Windows users:
- remove or comment these lines, or
- set the variable only on Linux (recommended in future code update).

## 4. Environment Setup

### Option A: Conda (recommended)

Linux/macOS:

```bash
conda create -n project_env python=3.10 -y
conda activate project_env
pip install -r requirements.txt
```

Windows (PowerShell or Anaconda Prompt):

```powershell
conda create -n project_env python=3.10 -y
conda activate project_env
pip install -r requirements.txt
```

### Option B: venv

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Windows (cmd):

```bat
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
```

## 5. Run Main Attendance App

```bash
python main.py
```

Startup sequence:
1. Connects to `attendance.db`
2. Creates tables if missing: `users`, `face_embeddings`, `attendance`
3. Starts camera stream
4. Warms up camera frames
5. Prompts for optional registration
6. Loads known embeddings
7. Starts recognition and attendance loop

## 6. Dashboard

Run:

```bash
streamlit run dashboard/app.py
```

The dashboard is API-connected. By default it calls:

```text
http://127.0.0.1:8000/api
```

You can change this from the sidebar in the Streamlit UI.

## 7. FastAPI Backend

Run the API server:

```bash
uvicorn api.server:app --reload --host 0.0.0.0 --port 8000
```

Available endpoints:
- `GET /api/health`
- `POST /api/users`
- `GET /api/users`
- `POST /api/attendance/mark`
- `GET /api/attendance`
- `GET /api/stats/today`

Interactive docs:

```text
http://127.0.0.1:8000/docs
```

Dashboard sections:
- Register User (placeholder message)
- Users
- Attendance
- Export CSV

## 8. Core Runtime Settings

Configured in `main.py`:

- `PERSISTENCE_TIME = 1.0`
- `DETECTION_INTERVAL = 3`
- `CACHE_TIME = 0.5`

Behavior:
- processes largest face first
- evaluates embedding every few frames
- requires stable identity duration before marking attendance

## 9. Common Issues

### Camera not opening

- try camera index `0`, `1`, or `2`
- ensure no other app is using the webcam

### ArcFace model missing

Expected path:

```text
~/.insightface/models/buffalo_l/w600k_r50.onnx
```

If missing, the embedder raises a runtime error.

### Windows fails due to Qt platform

If OpenCV window crashes on startup:
- remove `QT_QPA_PLATFORM=xcb` lines from `main.py` and `camera/camera_stream.py`

### Recognition too strict or too slow

- reduce detection interval for faster updates
- tune matcher threshold in `recognition/matcher.py`

## 10. Dependency List

The current `requirements.txt` includes:
- numpy
- opencv-python
- mediapipe
- insightface
- onnxruntime
- streamlit
- pandas

## 11. Prototype Run Order

For a full demo flow, start components in this order:

1. API server: `uvicorn api.server:app --reload --host 0.0.0.0 --port 8000`
2. Dashboard: `streamlit run dashboard/app.py`
3. Face recognition runtime (camera): `python main.py`

The recognition runtime and dashboard now write/read through the same database, and the dashboard communicates through the API.

## 12. Next Improvements

- make Qt platform selection OS-aware in code
- add API endpoints in `api/routes.py`
- add user edit/delete operations in dashboard
- add date-range attendance filters
- add liveness checks for anti-spoofing
