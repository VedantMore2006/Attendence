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
        const statusCard    = document.getElementById('scan-result-card');
        const statusMsg     = document.getElementById('status-message');
        const statusDetail  = document.getElementById('status-detail');
        const resultIcon    = document.getElementById('result-icon');
        const cameraFrame   = document.getElementById('camera-frame');
        const recognizedDiv = document.getElementById('recognized-user');
        const scanBtn       = document.getElementById('scan-btn');
        const logEntries    = document.getElementById('log-entries');
        const logRefreshBtn = document.getElementById('log-refresh-btn');

        const set = (el, prop, val) => { if (el) el[prop] = val; };
        const cls = (el, c)         => { if (el) el.className = c; };

        // Start camera
        const webcamStarted = await this.startWebcam('webcam', true);
        if (!webcamStarted) {
            cls(statusCard, 'scan-result-card state-error');
            set(resultIcon,   'innerText', '✗');
            set(statusMsg,    'innerText', 'Camera Error');
            set(statusDetail, 'innerText', 'Could not access camera — check permissions');
            return;
        }

        // Wait for video stream to have actual pixel data
        const video = document.getElementById('webcam');
        if (video && video.readyState < 2) {
            await new Promise(resolve => {
                video.addEventListener('loadeddata', resolve, { once: true });
                setTimeout(resolve, 4000);
            });
        }

        // Camera ready
        if (cameraFrame) cameraFrame.classList.add('scanning');
        cls(statusCard, 'scan-result-card state-ready');
        set(resultIcon,   'innerText', '◎');
        set(statusMsg,    'innerText', 'Ready to Scan');
        set(statusDetail, 'innerText', 'Press the button to check attendance');

        if (scanBtn) {
            scanBtn.disabled   = false;
            scanBtn.textContent = 'Scan Face';
            scanBtn.addEventListener('click', () => {
                this.performScan(scanBtn, statusCard, statusMsg, statusDetail, resultIcon, cameraFrame, recognizedDiv, logEntries);
            });
        }

        if (logRefreshBtn) {
            logRefreshBtn.addEventListener('click', () => this.loadLogPanel(logEntries));
        }

        // Load initial recent activity
        this.loadLogPanel(logEntries);
    },

    async performScan(btn, card, msg, detail, icon, cameraFrame, recognizedDiv, logEntries) {
        const set = (el, prop, val) => { if (el) el[prop] = val; };
        const cls = (el, c)         => { if (el) el.className = c; };

        const b64 = this.captureFrame('webcam', true);
        if (!b64) {
            cls(card, 'scan-result-card state-error');
            set(icon,   'innerText', '⚠');
            set(msg,    'innerText', 'Capture Failed');
            set(detail, 'innerText', 'Camera not ready — try again');
            return;
        }

        // Scanning state
        if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
        cls(card, 'scan-result-card state-scanning');
        set(icon,   'innerText', '⟳');
        set(msg,    'innerText', 'Processing…');
        set(detail, 'innerText', 'Analyzing your face');
        if (cameraFrame) cameraFrame.className = 'camera-frame scanning';

        try {
            // Send image to backend
            await API.scanAttendance(b64);

            // Give the server a moment to flush the log, then fetch it
            await new Promise(r => setTimeout(r, 400));
            const events = await API.getRecentScanEvents();

            // Use the latest log event as the source of truth for the UI
            if (events && events.length > 0) {
                const latest = events[0];
                this.updateScanUIFromLog(latest, card, msg, detail, icon, cameraFrame, recognizedDiv);
            } else {
                cls(card, 'scan-result-card state-error');
                set(icon,   'innerText', '?');
                set(msg,    'innerText', 'No Result');
                set(detail, 'innerText', 'Backend returned no log entry');
            }

            // Refresh log panel
            this.renderLogPanel(logEntries, events);

        } catch (err) {
            cls(card, 'scan-result-card state-error');
            set(icon,   'innerText', '⚠');
            set(msg,    'innerText', 'Connection Error');
            set(detail, 'innerText', err.message || 'Server unreachable');
        } finally {
            // Re-enable scan button after short delay
            setTimeout(() => {
                if (btn) { btn.disabled = false; btn.textContent = 'Scan Again'; }
            }, 1800);
        }
    },

    updateScanUIFromLog(event, card, msg, detail, icon, cameraFrame, recognizedDiv) {
        const set = (el, prop, val) => { if (el) el[prop] = val; };
        const cls = (el, c)         => { if (el) el.className = c; };

        switch (event.result) {
            case 'marked':
                cls(card, 'scan-result-card state-success');
                set(icon,   'innerText', '✓');
                set(msg,    'innerText', 'Attendance Marked!');
                set(detail, 'innerText', `Checked in at ${event.time}`);
                if (cameraFrame) cameraFrame.className = 'camera-frame success';
                this.showRecognizedUser(event.user, event.confidence, event.time, recognizedDiv, 'marked');
                this.showToast(`Welcome, ${event.user}! Marked at ${event.time}`, 'success');
                break;

            case 'already_marked':
                cls(card, 'scan-result-card state-warning');
                set(icon,   'innerText', '✓');
                set(msg,    'innerText', 'Already Checked In');
                set(detail, 'innerText', `First checked in at ${event.time}`);
                if (cameraFrame) cameraFrame.className = 'camera-frame warning';
                this.showRecognizedUser(event.user, event.confidence, event.time, recognizedDiv, 'already_marked');
                this.showToast(`${event.user} — already marked at ${event.time}`, 'warning');
                break;

            case 'no_match':
                cls(card, 'scan-result-card state-error');
                set(icon,   'innerText', '?');
                set(msg,    'innerText', 'Face Not Recognized');
                set(detail, 'innerText', 'Not registered — please register first');
                if (cameraFrame) cameraFrame.className = 'camera-frame scanning';
                if (recognizedDiv) recognizedDiv.innerHTML = '';
                break;

            case 'no_face':
            default:
                cls(card, 'scan-result-card state-scanning');
                set(icon,   'innerText', '◎');
                set(msg,    'innerText', 'No Face Detected');
                set(detail, 'innerText', 'Make sure your face is in the oval and try again');
                if (cameraFrame) cameraFrame.className = 'camera-frame scanning';
                if (recognizedDiv) recognizedDiv.innerHTML = '';
                break;
        }
    },

    async loadLogPanel(container) {
        if (!container) return;
        try {
            const events = await API.getRecentScanEvents();
            this.renderLogPanel(container, events);
        } catch (_) {
            if (container) container.innerHTML = '<p class="log-empty">Could not load activity</p>';
        }
    },

    renderLogPanel(container, events) {
        if (!container) return;
        if (!events || events.length === 0) {
            container.innerHTML = '<p class="log-empty">No recent activity</p>';
            return;
        }
        container.innerHTML = events.map(e => {
            const iconMap  = { marked: '✓', already_marked: '✓', no_match: '?', no_face: '○' };
            const clsMap   = { marked: 'log-success', already_marked: 'log-warning', no_match: 'log-error', no_face: 'log-muted' };
            const labelMap = {
                marked:         e.user ? `${e.user} — checked in at ${e.time}` : 'Marked',
                already_marked: e.user ? `${e.user} — already in at ${e.time}` : 'Already marked',
                no_match:       'Unknown face scanned',
                no_face:        'No face detected',
            };
            const ic  = iconMap[e.result]  || '○';
            const cl  = clsMap[e.result]   || 'log-muted';
            const lbl = labelMap[e.result] || e.result;
            const ts  = e.timestamp ? e.timestamp.split(' ')[1] : '';
            return `<div class="log-entry ${cl}">
                <span class="log-icon">${ic}</span>
                <div class="log-body">
                    <span class="log-label">${lbl}</span>
                    <span class="log-ts">${ts}</span>
                </div>
            </div>`;
        }).join('');
    },

    showRecognizedUser(name, confidence, time, container, status) {
        if (!container || !name) return;
        const initial   = name.charAt(0).toUpperCase();
        const confPct   = confidence != null ? (confidence * 100).toFixed(1) : null;
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
                if (countDisplay) countDisplay.textContent = `${this.capturedImages.length}/5 captured`;
                this.showToast('Image removed', 'info');
            });
            container.appendChild(thumb);
        });
        if (countDisplay) countDisplay.textContent = `${this.capturedImages.length}/5 captured`;
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