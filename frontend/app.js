const App = {
    stream: null,
    capturedImages: [],
    scanInterval: null,
    lastRecognizedUserId: null,
    lastScanStatus: null,
    registeredUsers: [],

    // Toast helper
    showToast(message, type = 'info') {
        showToast(message, type);
    },

    // --- Media Helpers ---
    async startWebcam(videoId, mirror = true) {
        try {
            if (this.stream) {
                this.stopWebcam();
            }
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, facingMode: 'user' } 
            });
            const video = document.getElementById(videoId);
            video.srcObject = this.stream;
            if (mirror) {
                video.style.transform = 'scaleX(-1)';
            }
            return true;
        } catch (err) {
            console.error("Webcam Error:", err);
            this.showToast("Could not access webcam. Please check permissions.", "error");
            return false;
        }
    },

    stopWebcam() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    },

    captureFrame(videoId, mirror = true) {
        const video = document.getElementById(videoId);
        if (!video || !video.videoWidth || !video.videoHeight) return null;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (mirror) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    },

    // --- Page: Scan ---
    async initScanPage() {
        const statusCard   = document.getElementById('scan-result-card');
        const statusMsg    = document.getElementById('status-message');
        const statusDetail = document.getElementById('status-detail');
        const resultIcon   = document.getElementById('result-icon');
        const cameraFrame  = document.getElementById('camera-frame');
        const recognizedDiv = document.getElementById('recognized-user');

        // Helper: safe DOM update (avoids silent crash if element is missing)
        const set = (el, prop, val) => { if (el) el[prop] = val; };
        const cls = (el, c) => { if (el) el.className = c; };

        set(statusMsg,    'innerText', 'Starting Camera…');
        set(statusDetail, 'innerText', 'Requesting camera access');

        const webcamStarted = await this.startWebcam('webcam', true);
        if (!webcamStarted) {
            cls(statusCard, 'scan-result-card state-error');
            set(resultIcon,   'innerText', '✗');
            set(statusMsg,    'innerText', 'Camera Error');
            set(statusDetail, 'innerText', 'Could not access camera — check permissions');
            return;
        }

        // Wait for video to actually start streaming before scanning
        const video = document.getElementById('webcam');
        if (video && video.readyState < 2) {
            await new Promise(resolve => {
                video.addEventListener('loadeddata', resolve, { once: true });
                setTimeout(resolve, 4000); // fallback
            });
        }

        // Camera is live — update UI
        if (cameraFrame) cameraFrame.classList.add('scanning');
        cls(statusCard, 'scan-result-card state-scanning');
        set(resultIcon,   'innerText', '⟳');
        set(statusMsg,    'innerText', 'Scanning…');
        set(statusDetail, 'innerText', 'Looking for faces');

        if (this.scanInterval) clearInterval(this.scanInterval);
        this.lastScanStatus = null;

        this.scanInterval = setInterval(async () => {
            const b64 = this.captureFrame('webcam', true);
            if (!b64) return; // video not ready yet — skip tick silently

            try {
                const result = await API.scanAttendance(b64);
                this.updateScanUI(result, statusCard, statusMsg, statusDetail, resultIcon, cameraFrame, recognizedDiv);
            } catch (err) {
                cls(statusCard, 'scan-result-card state-error');
                set(resultIcon,   'innerText', '⚠');
                set(statusMsg,    'innerText', 'Connection Error');
                set(statusDetail, 'innerText', err.message || 'Server unreachable');
            }
        }, 1500);
    },

    updateScanUI(res, card, msg, detail, icon, cameraFrame, recognizedDiv) {
        const set = (el, prop, val) => { if (el) el[prop] = val; };
        const cls = (el, c) => { if (el) el.className = c; };

        // Check if we already have a successful result displayed
        const hasSuccess = this.lastScanStatus &&
            (this.lastScanStatus.endsWith('_marked') || this.lastScanStatus.endsWith('_already'));

        switch (res.status) {
            case 'marked':
                cls(card, 'scan-result-card state-success');
                set(icon,   'innerText', '✓');
                set(msg,    'innerText', 'Attendance Marked!');
                set(detail, 'innerText', `Checked in at ${res.time}`);
                if (cameraFrame) cameraFrame.className = 'camera-frame success';
                this.showRecognizedUser(res.name, res.confidence, res.time, recognizedDiv, 'marked');
                if (this.lastScanStatus !== res.name + '_marked') {
                    this.showToast(`Welcome, ${res.name}! Marked at ${res.time}`, 'success');
                    this.lastScanStatus = res.name + '_marked';
                }
                break;

            case 'already_marked':
                cls(card, 'scan-result-card state-warning');
                set(icon,   'innerText', '✓');
                set(msg,    'innerText', 'Already Checked In');
                set(detail, 'innerText', `First checked in at ${res.time}`);
                if (cameraFrame) cameraFrame.className = 'camera-frame warning scanning';
                this.showRecognizedUser(res.name, res.confidence, res.time, recognizedDiv, 'already_marked');
                if (this.lastScanStatus !== res.name + '_already') {
                    this.showToast(`${res.name} — already marked at ${res.time}`, 'warning');
                    this.lastScanStatus = res.name + '_already';
                }
                break;

            case 'no_match':
                // Only show "not recognized" if we don't already have a success result up
                if (!hasSuccess) {
                    cls(card, 'scan-result-card state-error');
                    set(icon,   'innerText', '?');
                    set(msg,    'innerText', 'Face Not Recognized');
                    set(detail, 'innerText', 'Not registered — please register first');
                    if (cameraFrame) cameraFrame.className = 'camera-frame scanning';
                    if (recognizedDiv) recognizedDiv.innerHTML = '';
                    this.lastScanStatus = 'no_match';
                }
                break;

            case 'no_face':
            default:
                // If we already showed a recognized user, keep that result — don't reset
                if (hasSuccess) return;
                cls(card, 'scan-result-card state-scanning');
                set(icon,   'innerText', '⟳');
                set(msg,    'innerText', 'Scanning…');
                set(detail, 'innerText', 'Position your face in the oval');
                if (cameraFrame) cameraFrame.className = 'camera-frame scanning';
                if (recognizedDiv) recognizedDiv.innerHTML = '';
                this.lastScanStatus = 'no_face';
                break;
        }
    },

    showRecognizedUser(name, confidence, time, container, status) {
        if (!container || !name) return;
        const initial  = name.charAt(0).toUpperCase();
        const confPct  = confidence != null ? (confidence * 100).toFixed(1) : null;
        const timeLabel = status === 'marked' ? `Just checked in at ${time}` : `Checked in at ${time}`;
        container.innerHTML = `
            <div class="user-recognized">
                <div class="user-avatar-large">${initial}</div>
                <div class="user-recognized-info">
                    <h3>${name}</h3>
                    <p>${timeLabel}</p>
                    ${confPct ? `<span class="confidence-badge">Match ${confPct}%</span>` : ''}
                </div>
            </div>
        `;
    },

    stopScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.stopWebcam();
        const cameraFrame = document.getElementById('camera-frame');
        if (cameraFrame) cameraFrame.classList.remove('scanning');
    },

    // --- Page: Register ---
    async initRegisterPage() {
        const webcamStarted = await this.startWebcam('webcam', true);
        if (!webcamStarted) return;
        
        this.capturedImages = [];
        const captureBtn = document.getElementById('capture-btn');
        const submitBtn = document.getElementById('submit-reg');
        const statusDiv = document.getElementById('reg-status');
        const thumbnailsDiv = document.getElementById('thumbnails');
        const captureCount = document.getElementById('capture-count');
        
        if (captureBtn) {
            captureBtn.addEventListener('click', () => {
                if (this.capturedImages.length < 5) {  // Allow up to 5 images for better accuracy
                    const b64 = this.captureFrame('webcam', true);
                    this.capturedImages.push(b64);
                    this.updateThumbnails(thumbnailsDiv, captureCount);
                    
                    if (this.capturedImages.length === 5) {
                        captureBtn.disabled = true;
                        captureBtn.textContent = 'Max Images Captured';
                    } else {
                        captureBtn.textContent = `Capture Image (${this.capturedImages.length}/5)`;
                    }
                    
                    if (this.capturedImages.length >= 2) {
                        submitBtn.disabled = false;
                    }
                    
                    this.showToast(`Captured ${this.capturedImages.length}/5 images`, 'success');
                }
            });
        }
        
        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                const name = document.getElementById('username').value.trim();
                if (!name) {
                    this.showToast("Please enter a name", "error");
                    return;
                }
                
                if (this.capturedImages.length < 2) {
                    this.showToast("Please capture at least 2 images", "error");
                    return;
                }
                
                submitBtn.disabled = true;
                captureBtn.disabled = true;
                statusDiv.classList.remove('hidden');
                statusDiv.innerHTML = '<div class="spinner"></div> Processing registration...';
                statusDiv.className = "status-box status-info";
                
                try {
                    const res = await API.registerUser(name, this.capturedImages);
                    statusDiv.innerHTML = `
                        <strong>✓ Registration Successful!</strong><br>
                        User: ${res.name}<br>
                        Embeddings Stored: ${res.embeddings_stored}<br>
                        ${res.embeddings_failed > 0 ? `Failed: ${res.embeddings_failed}` : ''}
                    `;
                    statusDiv.className = "status-box status-success";
                    this.showToast(`${name} registered successfully!`, 'success');
                    
                    // Reset form
                    this.capturedImages = [];
                    document.getElementById('username').value = '';
                    if (thumbnailsDiv) thumbnailsDiv.innerHTML = '';
                    if (captureCount) captureCount.textContent = '0/5';
                    captureBtn.textContent = "Capture Image (0/5)";
                    captureBtn.disabled = false;
                    submitBtn.disabled = true;
                    
                    // Clear thumbnails after 3 seconds
                    setTimeout(() => {
                        statusDiv.classList.add('hidden');
                    }, 3000);
                } catch (err) {
                    statusDiv.innerHTML = `<strong>✗ Registration Failed</strong><br>${err.message}`;
                    statusDiv.className = "status-box status-error";
                    this.showToast(err.message, 'error');
                    submitBtn.disabled = false;
                    captureBtn.disabled = false;
                }
            });
        }
    },
    
    updateThumbnails(container, countDisplay) {
        if (!container) return;
        container.innerHTML = '';
        this.capturedImages.forEach((img, idx) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail';
            thumb.innerHTML = `
                <img src="${img}" alt="Capture ${idx + 1}">
                <div class="remove" data-index="${idx}">×</div>
            `;
            thumb.querySelector('.remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.capturedImages.splice(idx, 1);
                this.updateThumbnails(container, countDisplay);
                const captureBtn = document.getElementById('capture-btn');
                const submitBtn = document.getElementById('submit-reg');
                if (captureBtn) {
                    captureBtn.disabled = false;
                    captureBtn.textContent = `Capture Image (${this.capturedImages.length}/5)`;
                }
                if (submitBtn) {
                    submitBtn.disabled = this.capturedImages.length < 2;
                }
                if (countDisplay) countDisplay.textContent = `${this.capturedImages.length}/5`;
                this.showToast('Image removed', 'info');
            });
            container.appendChild(thumb);
        });
        if (countDisplay) countDisplay.textContent = `${this.capturedImages.length}/5`;
    },

    // --- Data Loading ---
    async loadAttendance() {
        const body = document.getElementById('attendance-body');
        if (!body) return;
        
        body.innerHTML = '<tr><td colspan="4"><div class="spinner"></div> Loading...</td></tr>';
        
        try {
            const data = await API.getAttendance();
            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="4">No attendance records found</td></tr>';
                return;
            }
            body.innerHTML = data.map(row => `
                <tr>
                    <td>${row.user_id}</td>
                    <td><strong>${row.name}</strong></td>
                    <td>${row.date}</td>
                    <td>${row.time}</td>
                </tr>
            `).join('');
        } catch (err) {
            body.innerHTML = '<tr><td colspan="4">Failed to load attendance data</td></tr>';
            this.showToast('Failed to load attendance', 'error');
        }
    },

    async loadStats() {
        try {
            const stats = await API.getTodayStats();
            const totalEl = document.getElementById('stat-total');
            const presentEl = document.getElementById('stat-present');
            const percentEl = document.getElementById('stat-percent');
            const dateEl = document.getElementById('stat-date');
            
            if (totalEl) totalEl.innerText = stats.total_users;
            if (presentEl) presentEl.innerText = stats.present_users;
            if (percentEl) percentEl.innerText = stats.attendance_percent + "%";
            if (dateEl) dateEl.innerText = stats.date;
        } catch (err) {
            this.showToast('Failed to load statistics', 'error');
        }
    },
    
    // Cleanup on page unload
    cleanup() {
        this.stopScanning();
    }
};

// Cleanup on page navigation (for single-page feel)
window.addEventListener('beforeunload', () => {
    App.cleanup();
});