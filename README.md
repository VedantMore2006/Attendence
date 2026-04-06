# Smart Attendance System

A real-time face recognition attendance system built with Python, OpenCV, MediaPipe, ArcFace (InsightFace), FastAPI, and a modern web dashboard.

## Features

- ✅ Real-time face detection from webcam (MediaPipe BlazeFace)
- ✅ Face alignment and embedding extraction (ArcFace via InsightFace)
- ✅ Identity matching against stored embeddings using cosine similarity
- ✅ Once-per-day attendance marking with duplicate prevention
- ✅ RESTful API backend (FastAPI)
- ✅ Modern web dashboard with real-time scanning
- ✅ User management (create, view, delete)
- ✅ Attendance records with date filtering
- ✅ Attendance statistics for today
- ✅ Cross-platform support (Linux, macOS, Windows)

## Project Architecture

```text
Attendence/
├── api/                        # FastAPI backend
│   ├── routes.py              # API endpoints
│   ├── server.py              # FastAPI app initialization
│   └── errors.py              # Error handling
├── attendance/                # Attendance logic
│   ├── attendance_service.py  # Mark attendance, duplicate check
│   └── register_user.py       # User registration workflow
├── camera/                    # Camera streaming
│   └── camera_stream.py       # Webcam capture
├── database/                  # Database layer
│   ├── db.py                  # Connection management
│   └── models.py              # SQLite schema & queries
├── recognition/              # Face matching
│   └── matcher.py             # Cosine similarity matching
├── vision/                    # ML pipelines
│   ├── detector.py            # Face detection (MediaPipe)
│   ├── aligner.py             # Face alignment
│   └── embedder.py            # Embedding extraction (ArcFace)
├── dashboard/                 # Streamlit dashboard (legacy)
│   └── app.py                 # Streamlit interface
├── frontend/                  # Web dashboard (recommended)
│   ├── index.html            # Login page
│   ├── dashboard.html        # Main dashboard
│   ├── js/
│   │   ├── api.js            # API wrapper
│   │   ├── dashboard.js      # Dashboard logic
│   │   └── login.js          # Login logic
│   └── css/
│       └── style.css         # Glassmorphism styling
├── main.py                    # Desktop CLI app
├── requirements.txt           # Python dependencies (pinned versions)
└── README.md                  # This file
```

## System Requirements

### All Platforms
- **Python**: 3.10 or newer (required for type hints syntax)
- **Webcam**: USB or built-in camera (for registration and scanning)
- **RAM**: Minimum 4GB (8GB recommended)
- **Storage**: ~2GB available (for models and database)

### Linux (Ubuntu/Debian)
```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install -y \
    python3.10 python3.10-venv python3-pip \
    libopencv-dev python3-opencv \
    libsm6 libxext6 libxrender-dev \
    libmysqlclient-dev \
    xclip xsel
```

### macOS
```bash
# Using Homebrew
brew install python@3.10
brew install cmake
# OpenCV and other dependencies will be installed via pip
```

### Windows
- Download Python 3.10+ from [python.org](https://www.python.org/downloads/)
- **Enable**: "Add Python to PATH" during installation
- Install Visual C++ Build Tools (for native extensions)
- No additional system packages needed (pip will handle everything)

---

## Installation

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd Attendence
```

### Step 2: Create Virtual Environment

**Linux / macOS:**
```bash
# Using venv
python3.10 -m venv .venv
source .venv/bin/activate

# Or using conda
conda create -n attendance_env python=3.10
conda activate attendance_env
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
python -m venv .venv
.venv\Scripts\activate.bat
```

### Step 3: Install Dependencies
```bash
# Upgrade pip first
pip install --upgrade pip setuptools wheel

# Install all requirements
pip install -r requirements.txt
```

**Note**: First-time installation may take 5-10 minutes due to:
- OpenCV compilation
- InsightFace model download (~200MB)
- ONNX Runtime setup

### Step 4: Set Up Database
The database is **auto-initialized** on first run. No manual setup needed.

```bash
# Optional: Pre-initialize the database
python -c "from database.models import FaceDatabase; from database.db import Database; db = Database(); conn = db.connect(); FaceDatabase(conn); print('Database ready')"
```

### Step 5: Download ArcFace Model
The embedder automatically downloads on first use. To pre-download:
```bash
python -c "from vision.embedder import FaceEmbedder; e = FaceEmbedder(); e._ensure_model_loaded(); print('Models ready')"
```

Expected location: `~/.insightface/models/buffalo_l/w600k_r50.onnx` (~100MB)

---

## Running the Application

### Option A: Web Dashboard + API (Recommended)

**Terminal 1: Start the API server**
```bash
uvicorn api.server:app --reload --host 0.0.0.0 --port 8000
```
✅ API runs on `http://127.0.0.1:8000`  
📚 API docs: `http://127.0.0.1:8000/docs`

**Terminal 2: Serve the frontend**
```bash
cd frontend
python -m http.server 8080
```
✅ Dashboard runs on `http://127.0.0.1:8080`

Then open `http://127.0.0.1:8080/index.html` in your browser.

### Option B: Desktop CLI (Legacy)

```bash
python main.py
```

Startup sequence:
1. Initializes database
2. Loads face detection & embedding models
3. Prompts for user registration (optional)
4. Loads known embeddings
5. Opens webcam for real-time recognition
6. Marks attendance on face detection

Press `q` to quit.

### Option C: Streamlit Dashboard (Optional - Legacy)

```bash
streamlit run dashboard/app.py
```

⚠️ Note: This is a legacy interface. The web dashboard (`frontend/`) is recommended.

---

## API Endpoints

All endpoints are JSON-based. Base URL: `http://127.0.0.1:8000/api`

### Health Check
```http
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

### Users

**List Users**
```http
GET /api/users
```

**Create User (with optional face images)**
```http
POST /api/users
Content-Type: application/json

{
  "name": "John Doe",
  "images": ["data:image/jpeg;base64,...", "data:image/jpeg;base64,..."]
}
```

**Delete User**
```http
DELETE /api/users/{user_id}
```
⚠️ Cascades delete: embeddings + attendance records

### Attendance

**Scan Face**
```http
POST /api/attendance/scan
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,..."
}
```
**Response Status Values:** `marked`, `already_marked`, `no_face`, `no_match`

**Mark Attendance (Manual)**
```http
POST /api/attendance/mark
Content-Type: application/json

{
  "user_id": 1
}
```

**List Attendance**
```http
GET /api/attendance
GET /api/attendance?date=2026-04-06
```

### Statistics

**Today's Stats**
```http
GET /api/stats/today
```

**Response:**
```json
{
  "date": "2026-04-06",
  "total_users": 15,
  "present_users": 12,
  "attendance_percent": 80.0
}
```

---

## Web Dashboard Features

### Login
- Simple authentication (any username/password valid for demo)
- Session-based token storage

### Overview Tab
- Total registered users count
- Present users today count
- Attendance percentage
- Today's attendance table

### Users Tab
- List all registered users
- **Delete user** with confirmation modal
- Delete cascades: all embeddings and attendance records
- View registration timestamp

### Attendance & Scan Tab
- **Real-time face detection** from webcam
- Point camera at face
- Automatic user matching
- Shows matched user name & timestamp on success
- Displays status: ✅ Marked, ⚠️ Already marked today, ❌ No face detected, ❌ No match found
- **"Scan Another" button** to restart without leaving section

### Attendance Logs Tab
- View all historical attendance records
- Filter by date
- Timestamp format: HH:MM:SS AM/PM

### Registration Tab
- Add new user by name
- Capture 10 face frames from webcam
- Auto-stores embeddings
- Auto-marks first attendance on registration

---

## Configuration & Tuning

### Runtime Parameters (`main.py`)
```python
PERSISTENCE_TIME = 1.0   # Hold face for 1 second before marking (prevents flickering)
DETECTION_INTERVAL = 3   # Process every 3rd frame (balances speed vs accuracy)
CACHE_TIME = 0.5         # Cache embedding match for 0.5 seconds
```
↳ Adjust `DETECTION_INTERVAL` for speed vs accuracy tradeoff (lower = faster CPU, higher = more stable matches)

### Recognition Threshold (`recognition/matcher.py`)
```python
MATCH_THRESHOLD = 0.55   # Cosine similarity threshold (0.0 to 1.0)
# Lower = more lenient (may match wrong people)
# Higher = more strict (may miss registrations)
```

### Database Location (`api/routes.py`, `main.py`)
Default: `attendance.db` (current directory)
- Change `DB_PATH` variable to move database to different location

---

## Cross-Platform Setup

### Linux ✅
**Recommended platform**
- ✅ Full support for all components
- ✅ OpenCV Qt backend works natively
- ✅ All tested on Ubuntu 20.04+
- No additional configuration needed

### Windows ⚠️
**Fully supported with setup notes**

When running `main.py` or camera-based features on Windows:
1. **Qt Platform Warning**: Windows doesn't have the `xcb` (X11) platform plugin
   - **Solution**: Remove or comment out this line in `main.py` (around line 6):
   ```python
   # os.environ["QT_QPA_PLATFORM"] = "xcb"  # Linux only
   ```
   - **Also check**: `camera/camera_stream.py` - remove the same line if it exists

2. **Camera Access**: Ensure camera permission is granted
   - Settings → Privacy & Security → Camera → Allow access

3. **Python in PATH**: Ensure Python is added to your system PATH during installation

4. **Build Tools**: For native extensions, install Visual C++ Build Tools or Visual Studio Community Edition

### macOS ✅
**Fully supported**
- Uses native Cocoa/Metal backends
- Install Xcode command line tools if native compilation fails:
  ```bash
  xcode-select --install
  ```
- Camera access required: System Preferences → Security & Privacy → Camera

---

## Troubleshooting

### Camera Issues

**Arch Linux: "Permission denied" or camera not accessible**

⚠️ **Most common Arch Linux issue:** Browser or application cannot access `/dev/video*`

**Solution: Add user to `video` group**
```bash
# 1. Add your user to the video group
sudo usermod -aG video $USER

# 2. Reboot or log out and back in
reboot
# OR: newgrp video (alternative, no reboot needed)

# 3. Verify camera access
ls /dev/video*  # Should show /dev/video0, /dev/video1, etc.

# 4. Test camera access
python3 -c "import cv2; cap = cv2.VideoCapture(0); print('Camera ready' if cap.isOpened() else 'Camera failed')"
```

**If still failing:**
```bash
# Check current groups
groups

# Check device permissions
ls -la /dev/video*

# Fix permissions (if needed)
sudo chmod 666 /dev/video*
```

**Browser permission denied**
- Firefox: Check Settings → Privacy & Security → Permissions → Camera
- Chromium/Chrome: Check Settings → Privacy & Security → Site Settings → Camera
- Grant permission when prompted

**Linux: "Cannot retrieve V4L2 property" warning**
```
This warning is harmless—just v4l2 unavailable properties.
Ignore it and continue—camera will work fine.
```

**Windows: "The specified procedure could not be found"**
- This may indicate a missing C++ runtime library
- Install Visual C++ Redistributable: https://support.microsoft.com/en-us/help/2977003
- Or install Visual C++ Build Tools

**Windows/macOS: Camera permission denied or not found**
```
Allow app access:
- Windows: Settings → Privacy & Security → Camera
- macOS: System Preferences → Security & Privacy → Camera
```

**"Camera index not found" or camera opens but freezes**
```python
# Try different camera indices:
for idx in [0, 1, 2, 3]:
    cap = cv2.VideoCapture(idx)
    if cap.isOpened():
        print(f"Camera found at index {idx}")
        break
```

### Model Loading Issues

**"InsightFace model not found" at first run**
- Normal behavior—first startup downloads ~200MB of model files
- Wait 2-5 minutes for download to complete
- Pre-download manually:
```bash
python -c "from vision.embedder import FaceEmbedder; e = FaceEmbedder(); e._ensure_model_loaded(); print('Models loaded')"
```
- Models cached at: `~/.insightface/models/buffalo_l/w600k_r50.onnx`

**"ONNX Runtime error" or version mismatch**
```bash
# Update to latest ONNX Runtime
pip install --upgrade onnxruntime
```

**"Model not ready" - API returns 503 on first requests**
- Expected on first startup (models loading)
- Check `/api/health` endpoint—`model_ready: false` indicates loading
- Wait 3-5 seconds and retry

### Database Issues

**"No such table: users"**
```bash
# Reset database—auto-initializes on next app/API start
rm attendance.db
# Restart API or app, it will recreate tables automatically
```

**Database locked (multiple processes)**
- SQLite is single-writer threaded
- Solution: Run only ONE API instance
- For production use PostgreSQL (future upgrade)

**"Attendance already marked for today"**
- This is expected behavior—one attendance per user per day
- To mark again, delete the user's attendance record from database or restart next day

### Silent Operation & Reducing Notifications

**If you want silent scanning (no toasts, no polling)**

The frontend now supports a `silentMode` flag to suppress notifications during scanning:

```javascript
// In browser console (F12 → Console tab):
silentMode = true;   // Disable toasts & alerts during scanning
silentMode = false;  // Re-enable notifications
```

**What gets suppressed when `silentMode = true`:**
- ✅ Info & success notifications (still show errors)
- ✅ API health checks disabled (scan performance improves)
- ✅ Only scan results display on-screen (no toast popups)

**Manual Scanner Command** (for scripted/automated environments)
- Create a silent user batch file that sets `silentMode` before scanning
- Modify `frontend/js/dashboard.js` to default `silentMode = true` if desired

### Performance Issues

**Face detection slow or laggy**
- Increase `DETECTION_INTERVAL` in `main.py` (process fewer frames)
- Close background apps consuming CPU
- Check CPU/RAM usage: `top` (Linux/Mac) or Task Manager (Windows)

**API requests timing out**
- Check `/api/health` endpoint—if `model_ready: false`, models still loading
- Models take 2-5 seconds to lazy-load on first request
- Increase request timeout to 10+ seconds

**High memory usage**
- ONNX Runtime uses GPU inference if available
- Limit model instances (currently one global instance in memory)

---

## Dependency Versions

All dependencies are explicitly pinned in `requirements.txt`:

- **numpy**: ≥1.24.0, <2.0.0 — Numerical computing
- **opencv-python**: ≥4.8.0 — Computer vision, camera I/O
- **mediapipe**: ≥0.10.14 — Face detection (BlazeFace)
- **insightface**: ≥0.7.3 — Face embeddings (ArcFace model)
- **onnxruntime**: ≥1.17.0 — ONNX model inference engine
- **fastapi**: ≥0.112.0 — Web framework
- **uvicorn**: ≥0.30.0 — ASGI server (with standard extras for libuv)
- **pydantic**: ≥2.0.0 — Data validation
- **python-multipart**: ≥0.0.6 — Form data parsing
- **requests**: ≥2.31.0 — HTTP client
- **python-dateutil**: ≥2.8.2 — Date utilities
- **python-dotenv**: ≥1.0.0 — Environment variables
- **pandas**: ≥2.0 — Data manipulation (for Streamlit dashboard)
- **streamlit**: ≥1.33.0 — Optional web interface (legacy)

---

## Development

### Project Dependencies Graph
```
Web Frontend (HTML/CSS/JS) ← HTTP/JSON → FastAPI Backend
                                              ├→ Vision Pipeline (OpenCV + MediaPipe + InsightFace)
                                              ├→ Database Layer (SQLite)
                                              └→ Attendance Service

Desktop CLI (main.py)
    ├→ Vision Pipeline
    ├→ Camera Stream
    └→ Database Layer
```

### Adding New Endpoints

1. Add Pydantic model in `api/routes.py` for request/response validation
2. Define route with `@router.post()`, `@router.get()`, etc.
3. Use `Depends(get_connection)` for database access
4. Return typed Pydantic response
5. Errors auto-caught by centralized `app_error_handler`

### Testing API Endpoints

```bash
# Test endpoint interactively
curl -X POST http://127.0.0.1:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "images": []}'

# View API docs (auto-generated Swagger UI)
open http://127.0.0.1:8000/docs  # macOS
xdg-open http://127.0.0.1:8000/docs  # Linux
start http://127.0.0.1:8000/docs  # Windows
```

---

## Known Limitations

1. **No bulk user import**: Can't register users from CSV/Excel (future feature)
2. **SQLite only**: Not suitable for 1000+ concurrent users (add PostgreSQL support)
3. **No liveness detection**: Can fool system with high-quality photos of face
4. **No audit logs**: System events not persisted to file (add logging)
5. **Mock authentication**: No real password validation (add JWT/OAuth2 for production)
6. **Single face per scan**: Marks only one person per camera frame
7. **no camera calibration**: Doesn't account for camera angle or lighting changes

---

## Future Improvements

- [ ] Add anti-spoofing / liveness checks (eye blink detection, texture analysis)
- [ ] Real authentication (JWT tokens, OAuth2)
- [ ] PostgreSQL backend for scalability and concurrency
- [ ] Mobile app for attendance verification
- [ ] Email/SMS notifications for attendance
- [ ] Advanced reporting and date-range exports
- [ ] Multi-location/department support
- [ ] Docker containerization for easy deployment
- [ ] Face re-enrollment and quality checks
- [ ] Audit trail and admin logs

---

## Support & Issues

For bugs or questions, please:
1. Check [Troubleshooting](#troubleshooting) section above
2. Verify your OS and Python version: `python --version`
3. Confirm models downloaded: Check `~/.insightface/models/`
4. Try pre-downloading models: `python -c "from vision.embedder import FaceEmbedder; FaceEmbedder()._ensure_model_loaded()"`
5. Open an Issue with:
   - OS (Windows/macOS/Linux version)
   - Python version output
   - Error message and full traceback
   - Steps to reproduce

---

## License

MIT License

## Contributors

Built as a demonstration of modern Python ML and web technologies.
