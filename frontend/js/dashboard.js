document.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard ────────────────────────────────────────────────────────────
    if (!sessionStorage.getItem('auth_token')) {
        window.location.href = 'index.html';
        return;
    }

    // ── Date header ───────────────────────────────────────────────────────────
    const today = new Date();
    // Use local date (not UTC) so it matches the server's datetime.now().date()
    const todayStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');

    document.getElementById('currentDate').textContent = today.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    document.getElementById('logDateFilter').value = todayStr;

    // ──────────────────────────────────────────────────────────────────────────
    // Utilities
    // ──────────────────────────────────────────────────────────────────────────

    /** Convert "HH:MM:SS" → "h:MM:SS AM/PM" */
    function to12Hour(timeStr) {
        if (!timeStr) return '—';
        const parts = timeStr.split(':');
        let h = parseInt(parts[0], 10);
        const m = parts[1] || '00';
        const s = parts[2] || '00';
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m}:${s} ${ampm}`;
    }

    /** Generate a coloured avatar circle from a name string */
    function avatarEl(name) {
        const palette = ['#6366f1', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
        const color = palette[(name || '').charCodeAt(0) % palette.length];
        return `<span class="avatar" style="background:${color};">${(name || '?')[0].toUpperCase()}</span>`;
    }

    /** Skeleton loading rows for a table with `cols` columns */
    function skeletonRows(cols, count = 4) {
        const widths = [40, 55, 65, 70, 80];
        return Array.from({ length: count }, () =>
            `<tr>${Array.from({ length: cols }, () => {
                const w = widths[Math.floor(Math.random() * widths.length)];
                return `<td><span class="skeleton" style="width:${w}%;">&nbsp;</span></td>`;
            }).join('')}</tr>`
        ).join('');
    }

    /** Empty-state row for a table */
    function emptyRow(cols, icon, message) {
        return `<tr><td colspan="${cols}">
            <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="${icon}" style="width:2.25rem;height:2.25rem;"></i></div>
                <p>${message}</p>
            </div>
        </td></tr>`;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Toast notifications
    // ──────────────────────────────────────────────────────────────────────────

    const TOAST_ICONS = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };

    function showToast(title, message = '', type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <i data-lucide="${TOAST_ICONS[type] || 'info'}"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" aria-label="Dismiss"><i data-lucide="x" style="width:0.875rem;height:0.875rem;"></i></button>
        `;
        el.querySelector('.toast-close').addEventListener('click', () => dismissToast(el));
        container.appendChild(el);
        lucide.createIcons();

        const timer = setTimeout(() => dismissToast(el), duration);
        el._timer = timer;
    }

    function dismissToast(el) {
        clearTimeout(el._timer);
        el.style.animation = 'toastOut 0.28s ease forwards';
        setTimeout(() => el.remove(), 280);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scan result card
    // ──────────────────────────────────────────────────────────────────────────

    const scanResultCard  = document.getElementById('scanResultCard');
    const scanResultTitle = document.getElementById('scanResultTitle');
    const scanResultSub   = document.getElementById('scanResultSub');
    const scanStatusBadge = document.getElementById('scanStatusBadge');

    const SCAN_CONFIGS = {
        marked:         { cls: 'scan-result-success', icon: 'check-circle',   title: 'Attendance Marked' },
        already_marked: { cls: 'scan-result-warning', icon: 'clock',          title: 'Already Checked In' },
        no_face:        { cls: 'scan-result-info',    icon: 'scan-face',      title: 'No Face Detected' },
        no_match:       { cls: 'scan-result-error',   icon: 'user-x',         title: 'Not Recognised' },
        api_error:      { cls: 'scan-result-error',   icon: 'server-crash',   title: 'Server Error' },
        network_error:  { cls: 'scan-result-error',   icon: 'wifi-off',       title: 'Cannot Reach Server' },
    };

    function showScanResult(status, sub = '') {
        const cfg = SCAN_CONFIGS[status] || { cls: 'scan-result-info', icon: 'info', title: status };
        scanResultCard.className = `scan-result-card ${cfg.cls}`;
        scanResultCard.style.display = 'flex';

        // Lucide replaces <i data-lucide> with <svg> on first render, so we must
        // replace the whole node — querying 'i[data-lucide]' returns null otherwise.
        const existingIcon = scanResultCard.querySelector('i[data-lucide], svg');
        const newIcon = document.createElement('i');
        newIcon.setAttribute('data-lucide', cfg.icon);
        newIcon.style.cssText = 'width:1.375rem;height:1.375rem;flex-shrink:0;';
        if (existingIcon) {
            existingIcon.replaceWith(newIcon);
        } else {
            scanResultCard.prepend(newIcon);
        }

        scanResultTitle.textContent = cfg.title;
        scanResultSub.textContent = sub;
        lucide.createIcons();
    }

    function hideScanResult() {
        scanResultCard.style.display = 'none';
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Navigation
    // ──────────────────────────────────────────────────────────────────────────

    const sections = {
        'nav-dashboard':  'section-dashboard',
        'nav-attendance': 'section-attendance',
        'nav-registration': 'section-registration',
        'nav-users':      'section-users',
        'nav-logs':       'section-logs',
    };

    function switchSection(targetNavId) {
        // Stop scan when navigating away
        if (targetNavId !== 'nav-attendance') stopAttendanceScan();

        Object.entries(sections).forEach(([navId, sectionId]) => {
            const link    = document.getElementById(navId);
            const section = document.getElementById(sectionId);
            const active  = navId === targetNavId;
            link.classList.toggle('active', active);
            section.style.display = active ? 'block' : 'none';
        });

        // Load data for the new section
        if (targetNavId === 'nav-dashboard')    loadDashboardData();
        if (targetNavId === 'nav-users')        loadUsersData();
        if (targetNavId === 'nav-logs')         loadLogsData(document.getElementById('logDateFilter').value);
        if (targetNavId === 'nav-attendance')   prepareAttendanceSection();
    }

    Object.keys(sections).forEach(navId => {
        document.getElementById(navId).addEventListener('click', e => {
            e.preventDefault();
            switchSection(navId);
        });
    });

    // ── Logout ────────────────────────────────────────────────────────────────
    document.getElementById('logoutBtn').addEventListener('click', e => {
        e.preventDefault();
        sessionStorage.clear();
        window.location.href = 'index.html';
    });

    // ──────────────────────────────────────────────────────────────────────────
    // API health
    // ──────────────────────────────────────────────────────────────────────────

    const apiStatusEl = document.getElementById('apiStatus');

    async function checkApiHealth() {
        const health = await window.API.getHealth();
        if (health && health.status === 'ok') {
            const modelReady = health.model_ready;
            apiStatusEl.textContent = modelReady ? 'API Connected' : 'API Connected · Model Loading';
            apiStatusEl.className   = modelReady ? 'badge badge-success' : 'badge badge-warning';
        } else {
            apiStatusEl.textContent = 'API Offline';
            apiStatusEl.className   = 'badge badge-danger';
        }
    }

    setInterval(checkApiHealth, 30000);

    // ──────────────────────────────────────────────────────────────────────────
    // Overview — stats + today's attendance
    // ──────────────────────────────────────────────────────────────────────────

    const refreshBtn = document.getElementById('refreshTodayBtn');

    refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('btn-spinning');
        loadDashboardData().finally(() => refreshBtn.classList.remove('btn-spinning'));
    });

    async function loadDashboardData() {
        const [stats, attendance] = await Promise.all([
            window.API.getStatsToday(),
            window.API.getAttendance(todayStr),
        ]);

        if (stats) {
            document.getElementById('stat-total-users').textContent   = stats.total_users;
            document.getElementById('stat-present-today').textContent = stats.present_users;
            document.getElementById('stat-percent').textContent       = `${stats.attendance_percent}%`;
        }

        const tbody = document.getElementById('todayAttendanceTableBody');

        if (!attendance || attendance.length === 0) {
            tbody.innerHTML = emptyRow(4, 'calendar-x', 'No attendance recorded today.');
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = attendance.map(r => `
            <tr>
                <td><span style="color:var(--text-secondary);font-size:0.8125rem;">#${r.user_id}</span></td>
                <td><div class="user-cell">${avatarEl(r.name)}<span style="font-weight:500;">${r.name}</span></div></td>
                <td style="font-variant-numeric:tabular-nums;">${to12Hour(r.time)}</td>
                <td><span class="badge badge-success"><i data-lucide="check" style="width:0.7rem;height:0.7rem;"></i>Present</span></td>
            </tr>
        `).join('');
        lucide.createIcons();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Users table
    // ──────────────────────────────────────────────────────────────────────────

    async function loadUsersData() {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = skeletonRows(4);

        const users = await window.API.getUsers();
        document.getElementById('usersCountBadge').textContent = users ? `${users.length} users` : '—';

        if (!users || users.length === 0) {
            tbody.innerHTML = emptyRow(4, 'users', 'No users registered yet.');
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = users.map(u => {
            const ts  = u.created_at.replace(' ', 'T');
            const dt  = new Date(ts);
            const fmt = isNaN(dt.getTime()) ? u.created_at : dt.toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
            });
            return `
                <tr>
                    <td><span style="color:var(--text-secondary);font-size:0.8125rem;">#${u.id}</span></td>
                    <td><div class="user-cell">${avatarEl(u.name)}<span style="font-weight:500;">${u.name}</span></div></td>
                    <td style="color:var(--text-secondary);font-size:0.8125rem;">${fmt}</td>
                    <td style="text-align:center;">
                        <div class="user-actions">
                            <button class="user-action-btn delete" data-user-id="${u.id}" data-user-name="${u.name}" title="Delete user" aria-label="Delete">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        lucide.createIcons();
        attachDeleteListeners();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Logs table
    // ──────────────────────────────────────────────────────────────────────────

    document.getElementById('logDateFilter').addEventListener('change', e => loadLogsData(e.target.value));

    async function loadLogsData(date) {
        const tbody = document.getElementById('allLogsTableBody');
        tbody.innerHTML = skeletonRows(4);

        const logs = await window.API.getAttendance(date);

        if (!logs || logs.length === 0) {
            tbody.innerHTML = emptyRow(4, 'calendar-x', `No records for ${date}.`);
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = logs.map(r => `
            <tr>
                <td><span style="color:var(--text-secondary);font-size:0.8125rem;">#${r.id}</span></td>
                <td><div class="user-cell">${avatarEl(r.name)}<span style="font-weight:500;">${r.name}</span></div></td>
                <td style="color:var(--text-secondary);">${r.date}</td>
                <td style="font-variant-numeric:tabular-nums;">${to12Hour(r.time)}</td>
            </tr>
        `).join('');
        lucide.createIcons();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attendance Scan
    // ──────────────────────────────────────────────────────────────────────────

    const attendanceVideo  = document.getElementById('attendanceVideo');
    const attendanceCanvas = document.getElementById('attendanceCanvas');
    const startScanBtn     = document.getElementById('startScanBtn');
    const stopScanBtn      = document.getElementById('stopScanBtn');
    const scanWrapper      = document.getElementById('scanWrapper');

    let attendanceStream   = null;
    let attendanceInterval = null;
    let scanningActive     = false;

    function prepareAttendanceSection() {
        hideScanResult();
        stopAttendanceScan();
        scanStatusBadge.style.display = 'none';
    }

    startScanBtn.addEventListener('click', async () => {
        if (scanningActive) return;
        hideScanResult();

        try {
            attendanceStream = await navigator.mediaDevices.getUserMedia({ video: true });
            attendanceVideo.srcObject = attendanceStream;
            await attendanceVideo.play();
        } catch (err) {
            showToast('Camera Error', 'Could not access camera. Check browser permissions.', 'error');
            return;
        }

        scanWrapper.style.display = 'inline-block';
        startScanBtn.style.display = 'none';
        stopScanBtn.style.display  = 'inline-flex';
        scanStatusBadge.style.display = 'inline-flex';
        scanningActive = true;

        // Poll every 1.5 s
        attendanceInterval = setInterval(() => {
            if (scanningActive) scanFrame();
        }, 1500);

        scanFrame(); // immediate first scan
    });

    stopScanBtn.addEventListener('click', stopAttendanceScan);

    async function scanFrame() {
        if (!attendanceVideo.videoWidth || !attendanceVideo.videoHeight || !scanningActive) return;

        const ctx = attendanceCanvas.getContext('2d');
        attendanceCanvas.width  = attendanceVideo.videoWidth;
        attendanceCanvas.height = attendanceVideo.videoHeight;
        ctx.drawImage(attendanceVideo, 0, 0);

        const result = await window.API.scanAttendance(attendanceCanvas.toDataURL('image/jpeg'));

        // Network or server-side error — surface the real message
        if (!result || result.status === 'network_error') {
            showScanResult('network_error', (result && result.message) || 'Cannot reach the server.');
            return;
        }

        if (result.status === 'api_error') {
            // 503 = model still loading
            const msg = result.http_status === 503
                ? 'Face recognition model is still loading. Wait a moment and retry.'
                : result.message || 'An API error occurred.';
            showScanResult('api_error', msg);
            return;
        }

        if (result.status === 'marked') {
            showScanResult('marked', `${result.name} · ${to12Hour(result.time)}`);
            showToast('Attendance Marked', `${result.name} checked in at ${to12Hour(result.time)}.`, 'success');
            stopAttendanceScan();
            document.getElementById('scanButtonsWrapper').style.display = 'flex';
            return;
        }

        if (result.status === 'already_marked') {
            showScanResult('already_marked', `${result.name} · Checked in at ${to12Hour(result.time)}`);
            stopAttendanceScan();
            return;
        }

        if (result.status === 'no_face') {
            showScanResult('no_face', result.message || 'Please look directly at the camera.');
            return;
        }

        if (result.status === 'no_match') {
            showScanResult('no_match', 'Face not recognised. Register this user first.');
            return;
        }

        // Fallback for unexpected statuses
        showScanResult('no_face', result.message || 'Unexpected response from server.');
    }

    function stopAttendanceScan() {
        scanningActive = false;
        clearInterval(attendanceInterval);
        attendanceInterval = null;

        if (attendanceStream) {
            attendanceStream.getTracks().forEach(t => t.stop());
            attendanceStream = null;
            attendanceVideo.srcObject = null;
        }

        scanWrapper.style.display  = 'none';
        startScanBtn.style.display = 'inline-flex';
        stopScanBtn.style.display  = 'none';
        scanStatusBadge.style.display = 'none';
        document.getElementById('scanButtonsWrapper').style.display = 'none';
    }

    // Scan Another button to restart without leaving section
    document.getElementById('scanAnotherBtn')?.addEventListener('click', () => {
        hideScanResult();
        document.getElementById('scanButtonsWrapper').style.display = 'none';
        startScanBtn.click();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Registration
    // ──────────────────────────────────────────────────────────────────────────

    const video          = document.getElementById('video');
    const canvas         = document.getElementById('canvas');
    const videoWrapper   = document.getElementById('videoWrapper');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const captureBtn     = document.getElementById('captureBtn');
    const captureProgress = document.getElementById('captureProgress');
    const captureDotsEl  = document.getElementById('captureDots');
    const captureStatus  = document.getElementById('captureStatus');
    const registerForm   = document.getElementById('registrationForm');

    const MAX_CAPTURES   = 10;
    let capturedImages   = [];
    let regStream        = null;
    let captureInterval  = null;

    function renderCaptureDots(filled) {
        captureDotsEl.innerHTML = Array.from({ length: MAX_CAPTURES }, (_, i) =>
            `<span class="capture-dot ${i < filled ? 'filled' : ''}"></span>`
        ).join('');
        captureStatus.textContent = `${filled} of ${MAX_CAPTURES} frames captured`;
    }

    startCameraBtn.addEventListener('click', async () => {
        clearInterval(captureInterval);
        capturedImages = [];
        renderCaptureDots(0);

        try {
            regStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = regStream;
            videoWrapper.style.display = 'block';
            captureProgress.style.display = 'flex';
            captureBtn.style.display = 'inline-flex';
            captureBtn.disabled = false;
            captureBtn.innerHTML = '<i data-lucide="x"></i> Stop Capture';
            lucide.createIcons();
            await video.play();
        } catch (err) {
            showToast('Camera Error', 'Could not access camera. Check browser permissions.', 'error');
            return;
        }

        // Wait for video dimensions to be ready
        await new Promise(resolve => {
            if (video.videoWidth > 0) return resolve();
            video.addEventListener('loadedmetadata', resolve, { once: true });
            setTimeout(resolve, 1200);
        });

        captureInterval = setInterval(() => {
            if (capturedImages.length >= MAX_CAPTURES) {
                clearInterval(captureInterval);
                captureBtn.innerHTML = '<i data-lucide="check"></i> Captured';
                captureBtn.disabled = true;
                lucide.createIcons();
                return;
            }
            captureFrame();
        }, 900);
    });

    captureBtn.addEventListener('click', () => {
        clearInterval(captureInterval);
        captureBtn.innerHTML = '<i data-lucide="square"></i> Stopped';
        captureBtn.disabled = true;
        lucide.createIcons();
    });

    function captureFrame() {
        if (!video.videoWidth || !video.videoHeight) return;
        const ctx = canvas.getContext('2d');
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        capturedImages.push(canvas.toDataURL('image/jpeg'));
        renderCaptureDots(capturedImages.length);
    }

    registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        clearInterval(captureInterval);

        const name = document.getElementById('userName').value.trim();
        if (!name) {
            showToast('Missing Name', 'Please enter a name before registering.', 'warning');
            return;
        }
        if (capturedImages.length === 0) {
            showToast('No Images', 'Start the camera and capture at least one frame.', 'warning');
            return;
        }

        const submitBtn = document.getElementById('registerSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader"></i> Registering…';
        lucide.createIcons();

        try {
            const res = await window.API.createUser({ name, images: capturedImages });

            if (res && res.id) {
                const embMsg = res.embeddings_stored > 0
                    ? `${res.embeddings_stored} face embeddings stored.`
                    : 'No face embeddings — retake with better lighting.';
                showToast('User Registered', `${res.name} · ${embMsg}`, res.embeddings_stored > 0 ? 'success' : 'warning');

                // Reset form
                registerForm.reset();
                capturedImages = [];
                renderCaptureDots(0);
                captureProgress.style.display = 'none';
                videoWrapper.style.display    = 'none';
                captureBtn.style.display      = 'none';

                if (regStream) {
                    regStream.getTracks().forEach(t => t.stop());
                    regStream = null;
                    video.srcObject = null;
                }
            } else {
                showToast('Registration Failed', 'Server returned an unexpected response.', 'error');
            }
        } catch (err) {
            showToast('Registration Error', err.message || 'Unknown error occurred.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i data-lucide="user-plus"></i> Register User';
            lucide.createIcons();
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Delete User Modal
    // ──────────────────────────────────────────────────────────────────────────

    const deleteModal = document.getElementById('deleteModal');
    const deleteModalOverlay = document.getElementById('deleteModalOverlay');
    const deleteModalMessage = document.getElementById('deleteModalMessage');
    const deleteModalClose = document.getElementById('deleteModalClose');
    const deleteModalCancel = document.getElementById('deleteModalCancel');
    const deleteModalConfirm = document.getElementById('deleteModalConfirm');

    let pendingDeleteUserId = null;
    let pendingDeleteUserName = null;

    function openDeleteModal(userId, userName) {
        pendingDeleteUserId = userId;
        pendingDeleteUserName = userName;
        deleteModalMessage.textContent = `Delete ${userName}? This will remove all attendance records and cannot be undone.`;
        deleteModal.style.display = 'flex';
    }

    function closeDeleteModal() {
        deleteModal.style.display = 'none';
        pendingDeleteUserId = null;
        pendingDeleteUserName = null;
    }

    deleteModalOverlay.addEventListener('click', closeDeleteModal);
    deleteModalClose.addEventListener('click', closeDeleteModal);
    deleteModalCancel.addEventListener('click', closeDeleteModal);

    deleteModalConfirm.addEventListener('click', async () => {
        if (!pendingDeleteUserId) return;
        deleteModalConfirm.disabled = true;
        deleteModalConfirm.innerHTML = '<i data-lucide="loader"></i> Deleting…';
        lucide.createIcons();

        const success = await window.API.deleteUser(pendingDeleteUserId);
        if (success) {
            showToast('User Deleted', `${pendingDeleteUserName} has been removed.`, 'success');
            closeDeleteModal();
            loadUsersData();
        } else {
            showToast('Delete Failed', 'Could not delete user. Please try again.', 'error');
        }

        deleteModalConfirm.disabled = false;
        deleteModalConfirm.innerHTML = '<i data-lucide="trash-2"></i> Delete User';
        lucide.createIcons();
    });

    function attachDeleteListeners() {
        document.querySelectorAll('.user-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                openDeleteModal(parseInt(userId), userName);
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Init
    // ──────────────────────────────────────────────────────────────────────────

    checkApiHealth();
    loadDashboardData();

    // Show skeleton on initial table loads so they don't flash "undefined"
    document.getElementById('todayAttendanceTableBody').innerHTML = skeletonRows(4);
    lucide.createIcons();
});
