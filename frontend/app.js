const App = {
    stream: null,
    capturedImages: [],
    scanInterval: null,
    lastRecognizedUserId: null,
    lastScanStatus: null,
    registeredUsers: [],
    _statsRange: 'today',

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

            case 'checked_out':
                cls(card, 'scan-result-card state-checkout');
                set(icon,   'innerHTML', '<i class="fas fa-right-from-bracket"></i>');
                set(msg,    'innerText', 'Checked Out');
                set(detail, 'innerText', `Left at ${event.time}`);
                if (cameraFrame) cameraFrame.className = 'camera-frame checkout';
                this.showRecognizedUser(event.user, event.confidence, event.time, recognizedDiv, 'checked_out');
                this.showToast(`Goodbye, ${event.user}! Checked out at ${event.time}`, 'info');
                break;

            case 'already_marked':
                cls(card, 'scan-result-card state-warning');
                set(icon,   'innerText', '✓');
                set(msg,    'innerText', 'Already Completed');
                set(detail, 'innerText', `Already checked in & out today`);
                if (cameraFrame) cameraFrame.className = 'camera-frame warning';
                this.showRecognizedUser(event.user, event.confidence, event.time, recognizedDiv, 'already_marked');
                this.showToast(`${event.user} — attendance already complete today`, 'warning');
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
            const iconMap  = { marked: '✓', checked_out: '⇤', already_marked: '✓', no_match: '?', no_face: '○' };
            const clsMap   = { marked: 'log-success', checked_out: 'log-checkout', already_marked: 'log-warning', no_match: 'log-error', no_face: 'log-muted' };
            const labelMap = {
                marked:         e.user ? `${e.user} — in at ${e.time}` : 'Marked',
                checked_out:    e.user ? `${e.user} — out at ${e.time}` : 'Checked out',
                already_marked: e.user ? `${e.user} — already complete` : 'Already marked',
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
        const timeLabel = status === 'marked'      ? `Just checked in at ${time}` :
                          status === 'checked_out' ? `Checked out at ${time}` :
                                                     `Checked in at ${time}`;
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

    // --- Page: Stats Dashboard ---
    async loadStats() {
        const range = this._statsRange || 'today';
        try {
            if (range === 'today') {
                await this._loadTodayDash();
            } else {
                await this._loadMultiDayDash(range === 'week' ? 7 : 30);
            }
            this._flashDashUpdate();
        } catch (err) {
            console.error('Stats load error:', err);
            this.showToast('Failed to load statistics', 'error');
        }
    },

    async _loadTodayDash() {
        const today     = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        const [stats, users, todayRecs, yesterdayRecs] = await Promise.all([
            API.getTodayStats(),
            API.getUsers(),
            API.getAttendance(today),
            API.getAttendance(yesterday),
        ]);

        const present          = stats.present_users;
        const currentlyPresent = stats.currently_present ?? present;
        const checkedOut       = stats.checked_out_count  ?? 0;
        const total            = stats.total_users;
        const percent          = stats.attendance_percent;
        const yPresent         = new Set(yesterdayRecs.map(r => r.user_id)).size;
        const diff             = present - yPresent;

        // Date label
        this._setEl('stat-date', new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }));
        this._setEl('hero-label', 'Arrived Today (Check-ins)');

        // Hero big numbers
        this._animateNum('stat-present', present);
        this._animateNum('stat-total',   total);
        this._animateNum('sec-currently', currentlyPresent);
        this._animateNum('sec-checkout',  checkedOut);
        this._animateNum('sec-absent',    total - present);
        this._setEl('hero-percent', percent + '%');
        this._setEl('sec-absent-sub', 'Not arrived yet');
        this._setEl('sec-peak-label', 'Peak Check-in Hour');

        // Progress bar
        const bar = document.getElementById('hero-bar-fill');
        if (bar) setTimeout(() => { bar.style.width = Math.min(percent, 100) + '%'; }, 120);

        // Health color on hero card
        const card = document.getElementById('hero-card');
        if (card) card.className = 'dashboard-hero-card ' +
            (percent >= 75 ? 'health-good' : percent >= 50 ? 'health-warn' : 'health-critical');

        // Trend badge
        const badge  = document.getElementById('trend-badge');
        const tIcon  = document.getElementById('trend-icon');
        const tText  = document.getElementById('trend-text');
        if (badge && tIcon && tText) {
            if (diff > 0) {
                badge.className = 'trend-badge trend-up';
                tIcon.innerHTML = '<i class="fas fa-arrow-trend-up"></i>';
                tText.innerText = `+${diff} vs yesterday`;
            } else if (diff < 0) {
                badge.className = 'trend-badge trend-down';
                tIcon.innerHTML = '<i class="fas fa-arrow-trend-down"></i>';
                tText.innerText  = `${diff} vs yesterday`;
            } else {
                badge.className = 'trend-badge trend-neutral';
                tIcon.innerHTML = '<i class="fas fa-minus"></i>';
                tText.innerText  = yPresent === 0 ? 'No data yesterday' : 'Same as yesterday';
            }
        }

        // Hourly distribution
        const hourlyData = {};
        todayRecs.forEach(r => {
            const h = parseInt(r.time.split(':')[0], 10);
            hourlyData[h] = (hourlyData[h] || 0) + 1;
        });

        // Peak hour
        const hrs = Object.keys(hourlyData).map(Number);
        const peak = hrs.length > 0 ? hrs.reduce((a, b) => hourlyData[a] > hourlyData[b] ? a : b) : null;
        this._setEl('sec-peak', peak !== null ? this._fmtHour(peak) : '—');

        // Chart
        this._setEl('chart-subtitle', 'Check-ins by hour — Today');
        this._setEl('chart-meta',     todayRecs.length + ' check-ins');
        this._drawHourlyChart(hourlyData, todayRecs.length === 0);

        // Recent check-ins panel
        const sorted = [...todayRecs].sort((a, b) => b.time.localeCompare(a.time));
        this._renderCheckinList(sorted.slice(0, 10));
        this._setEl('checkin-count-badge', todayRecs.length);

        // Absent users panel
        const presentIds = new Set(todayRecs.map(r => r.user_id));
        const absent = users.filter(u => !presentIds.has(u.id));
        this._renderAbsentList(absent);
        this._setEl('absent-count-badge', absent.length);
    },

    async _loadMultiDayDash(days) {
        const dates = [];
        for (let i = 0; i < days; i++) {
            dates.push(new Date(Date.now() - i * 86400000).toISOString().split('T')[0]);
        }

        const [stats, allRecords] = await Promise.all([
            API.getTodayStats(),
            Promise.all(dates.map(d => API.getAttendance(d))),
        ]);

        const total     = stats.total_users;
        const label     = days === 7 ? 'This Week' : 'This Month';

        // Build daily counts (unique users per day)
        const dailyCounts = {};
        dates.forEach((d, i) => {
            dailyCounts[d] = new Set(allRecords[i].map(r => r.user_id)).size;
        });

        const totalCheckins = Object.values(dailyCounts).reduce((a, b) => a + b, 0);
        const avgPresent    = totalCheckins / days;
        const avgPercent    = total > 0 ? Math.round((avgPresent / total) * 100) : 0;

        // Best day
        const bestDay = Object.keys(dailyCounts).reduce((a, b) => dailyCounts[a] >= dailyCounts[b] ? a : b, dates[0]);
        const bestDayLabel = new Date(bestDay + 'T00:00:00').toLocaleDateString('en-US',
            { weekday: 'short', month: 'short', day: 'numeric' });

        // Trend: compare first half vs second half of the range
        const half = Math.floor(days / 2);
        const recentTotal = dates.slice(0, half).reduce((s, d) => s + dailyCounts[d], 0);
        const olderTotal  = dates.slice(half).reduce((s, d) => s + dailyCounts[d], 0);
        const halfDiff    = recentTotal - olderTotal;

        // Date label
        this._setEl('stat-date', `${label} — ${dates[dates.length - 1]} → ${dates[0]}`);
        this._setEl('hero-label', `Avg Present / Day`);

        this._animateNum('stat-present',   Math.round(avgPresent));
        this._animateNum('stat-total',     total);
        this._animateNum('sec-currently',  Math.round(avgPresent));
        this._animateNum('sec-checkout',   0);   // not tracked in multi-day view
        this._animateNum('sec-absent',     total - Math.round(avgPresent));
        this._setEl('hero-percent',    avgPercent + '%');
        this._setEl('sec-absent-sub',  'avg not present');
        this._setEl('sec-peak-label',  'Best Day');
        this._setEl('sec-peak',        bestDayLabel);

        const bar = document.getElementById('hero-bar-fill');
        if (bar) setTimeout(() => { bar.style.width = Math.min(avgPercent, 100) + '%'; }, 120);

        const card = document.getElementById('hero-card');
        if (card) card.className = 'dashboard-hero-card ' +
            (avgPercent >= 75 ? 'health-good' : avgPercent >= 50 ? 'health-warn' : 'health-critical');

        const badge = document.getElementById('trend-badge');
        const tIcon = document.getElementById('trend-icon');
        const tText = document.getElementById('trend-text');
        if (badge && tIcon && tText) {
            if (halfDiff > 0) {
                badge.className = 'trend-badge trend-up';
                tIcon.innerHTML = '<i class="fas fa-arrow-trend-up"></i>';
                tText.innerText  = `Trending up this ${days === 7 ? 'week' : 'month'}`;
            } else if (halfDiff < 0) {
                badge.className = 'trend-badge trend-down';
                tIcon.innerHTML = '<i class="fas fa-arrow-trend-down"></i>';
                tText.innerText  = `Trending down this ${days === 7 ? 'week' : 'month'}`;
            } else {
                badge.className = 'trend-badge trend-neutral';
                tIcon.innerHTML = '<i class="fas fa-minus"></i>';
                tText.innerText  = 'Stable attendance';
            }
        }

        this._setEl('chart-subtitle', `Daily attendance — ${label}`);
        this._setEl('chart-meta',     totalCheckins + ' total check-ins');
        this._drawDailyChart(dailyCounts, dates, total);

        // Show today's check-ins in the recent panel
        const todayRecs = allRecords[0];
        const sorted = [...todayRecs].sort((a, b) => b.time.localeCompare(a.time));
        this._renderCheckinList(sorted.slice(0, 10));
        this._setEl('checkin-count-badge', todayRecs.length);

        // Absent panel not meaningful for multi-day; show info message
        const absentEl = document.getElementById('absent-list');
        if (absentEl) absentEl.innerHTML =
            '<div class="panel-empty"><i class="fas fa-calendar-check"></i> Switch to Today to see absent users</div>';
        this._setEl('absent-count-badge', '—');
    },

    // ── Helpers ───────────────────────────────────────────────────────────────

    _setEl(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    },

    _animateNum(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        const start = parseInt(el.innerText, 10) || 0;
        if (start === target) { el.innerText = target; return; }
        const steps = 16;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            el.innerText = Math.round(start + (target - start) * (step / steps));
            if (step >= steps) { el.innerText = target; clearInterval(timer); }
        }, 28);
    },

    _fmtHour(h) {
        if (h === 0)  return '12 am';
        if (h < 12)   return h + ' am';
        if (h === 12) return '12 pm';
        return (h - 12) + ' pm';
    },

    _renderCheckinList(records) {
        const el = document.getElementById('checkin-list');
        if (!el) return;
        if (!records || records.length === 0) {
            el.innerHTML = '<div class="panel-empty"><i class="fas fa-clock"></i> No check-ins yet today</div>';
            return;
        }
        el.innerHTML = records.map(r => {
            const initial = r.name.charAt(0).toUpperCase();
            return `<div class="checkin-item">
                <div class="checkin-avatar">${initial}</div>
                <div class="checkin-info">
                    <span class="checkin-name">${r.name}</span>
                    <span class="checkin-time"><i class="fas fa-clock"></i> ${r.time}</span>
                </div>
                <span class="checkin-tick"><i class="fas fa-circle-check"></i></span>
            </div>`;
        }).join('');
    },

    _renderAbsentList(users) {
        const el = document.getElementById('absent-list');
        if (!el) return;
        if (!users || users.length === 0) {
            el.innerHTML = '<div class="panel-empty"><i class="fas fa-circle-check" style="color:var(--success)"></i> All users marked!</div>';
            return;
        }
        el.innerHTML = users.map(u => {
            const initial = u.name.charAt(0).toUpperCase();
            return `<div class="absent-item">
                <div class="absent-avatar">${initial}</div>
                <div class="absent-info">
                    <span class="absent-name">${u.name}</span>
                    <span class="absent-status"><i class="fas fa-circle-xmark"></i> Not marked</span>
                </div>
            </div>`;
        }).join('');
    },

    _drawHourlyChart(hourlyData, isEmpty) {
        const canvas  = document.getElementById('hourly-chart');
        const emptyEl = document.getElementById('chart-empty');
        if (!canvas) return;

        if (isEmpty) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        const ctx  = canvas.getContext('2d');
        const dpr  = window.devicePixelRatio || 1;
        const cW   = canvas.parentElement.offsetWidth || 600;
        const cH   = 200;

        canvas.width  = cW * dpr;
        canvas.height = cH * dpr;
        canvas.style.width  = cW + 'px';
        canvas.style.height = cH + 'px';
        ctx.scale(dpr, dpr);

        const W = cW, H = cH;
        const pad = { top: 28, right: 12, bottom: 40, left: 34 };
        const chartW = W - pad.left - pad.right;
        const chartH = H - pad.top - pad.bottom;

        // Show 6 am → 10 pm (17 slots)
        const hours = Array.from({ length: 17 }, (_, i) => i + 6);
        const vals  = hours.map(h => hourlyData[h] || 0);
        const maxV  = Math.max(...vals, 1);
        const slots = hours.length;
        const slotW = chartW / slots;
        const barW  = Math.max(slotW * 0.55, 4);

        ctx.clearRect(0, 0, W, H);

        // Grid lines
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (chartH / 4) * i;
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(W - pad.right, y);
            ctx.stroke();

            if (i < 4) {
                const lv = Math.round(maxV - (maxV / 4) * i);
                ctx.fillStyle = 'rgba(161,169,181,0.45)';
                ctx.font = '9px Inter, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(lv || '', pad.left - 4, y + 3);
            }
        }

        // Bars
        hours.forEach((hour, i) => {
            const val  = vals[i];
            const bH   = val > 0 ? Math.max((val / maxV) * chartH, 4) : 2;
            const x    = pad.left + i * slotW + (slotW - barW) / 2;
            const y    = pad.top + chartH - bH;

            if (val > 0) {
                const g = ctx.createLinearGradient(x, y, x, y + bH);
                g.addColorStop(0, 'rgba(249,115,22,0.95)');
                g.addColorStop(1, 'rgba(249,115,22,0.3)');
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
            }

            this._roundedBar(ctx, x, y, barW, bH, 3);

            if (val > 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.font = '9px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(val, x + barW / 2, y - 4);
            }

            // Hour label — show every other label to avoid crowding
            if (i % 2 === 0 || slots <= 10) {
                const lbl = hour === 12 ? '12p' : hour < 12 ? hour + 'a' : (hour - 12) + 'p';
                ctx.fillStyle = 'rgba(161,169,181,0.6)';
                ctx.font = '9px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(lbl, x + barW / 2, H - pad.bottom + 14);
            }
        });
    },

    _drawDailyChart(dailyCounts, dates, totalUsers) {
        const canvas  = document.getElementById('hourly-chart');
        const emptyEl = document.getElementById('chart-empty');
        if (!canvas) return;

        const hasData = Object.values(dailyCounts).some(v => v > 0);
        if (!hasData) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const cW  = canvas.parentElement.offsetWidth || 600;
        const cH  = 200;

        canvas.width  = cW * dpr;
        canvas.height = cH * dpr;
        canvas.style.width  = cW + 'px';
        canvas.style.height = cH + 'px';
        ctx.scale(dpr, dpr);

        const W = cW, H = cH;
        const pad = { top: 28, right: 12, bottom: 40, left: 34 };
        const chartW = W - pad.left - pad.right;
        const chartH = H - pad.top - pad.bottom;

        const ordered = [...dates].reverse();
        const vals    = ordered.map(d => dailyCounts[d] || 0);
        const maxV    = Math.max(...vals, totalUsers > 0 ? totalUsers : 1);
        const slots   = ordered.length;
        const slotW   = chartW / slots;
        const barW    = Math.max(slotW * 0.55, 3);
        const todayStr = new Date().toISOString().split('T')[0];

        ctx.clearRect(0, 0, W, H);

        // Grid + capacity dashed line
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (chartH / 4) * i;
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        }
        if (totalUsers > 0) {
            const capY = pad.top + chartH - (totalUsers / maxV) * chartH;
            ctx.strokeStyle = 'rgba(249,115,22,0.3)';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pad.left, capY); ctx.lineTo(W - pad.right, capY); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(249,115,22,0.55)';
            ctx.font = '8px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('max', W - pad.right - 2, capY - 3);
        }

        // Bars
        ordered.forEach((date, i) => {
            const val     = vals[i];
            const bH      = val > 0 ? Math.max((val / maxV) * chartH, 3) : 2;
            const x       = pad.left + i * slotW + (slotW - barW) / 2;
            const y       = pad.top + chartH - bH;
            const isToday = date === todayStr;

            if (val > 0) {
                const g = ctx.createLinearGradient(x, y, x, y + bH);
                g.addColorStop(0, isToday ? 'rgba(249,115,22,1)'   : 'rgba(249,115,22,0.7)');
                g.addColorStop(1, isToday ? 'rgba(249,115,22,0.5)' : 'rgba(249,115,22,0.2)');
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
            }

            this._roundedBar(ctx, x, y, barW, bH, 3);

            // Value label — only if few bars
            if (val > 0 && slots <= 14) {
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.font = '8px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(val, x + barW / 2, y - 4);
            }

            // Date label — skip some for month view
            const showLabel = slots <= 10 || i % 5 === 0 || i === slots - 1 || isToday;
            if (showLabel) {
                const d = new Date(date + 'T00:00:00');
                const lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                ctx.fillStyle = isToday ? 'rgba(249,115,22,0.9)' : 'rgba(161,169,181,0.55)';
                ctx.font = isToday ? 'bold 8px Inter, sans-serif' : '8px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(lbl, x + barW / 2, H - pad.bottom + 14);
            }
        });
    },

    _roundedBar(ctx, x, y, w, h, r) {
        if (h <= 0) return;
        if (h < r * 2) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
    },

    _flashDashUpdate() {
        document.querySelectorAll('.mini-stat-card').forEach(c => {
            c.classList.remove('flash-update');
            void c.offsetWidth; // reflow to restart animation
            c.classList.add('flash-update');
        });
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