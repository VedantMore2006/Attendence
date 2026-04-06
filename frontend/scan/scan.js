// Global state
let videoStream = null;
let canvas = null;
let canvasCtx = null;
let scanningInterval = null;
let lastScannedFace = null;
let scannedToday = new Set(); // Track already scanned users to avoid duplicates
let recentScans = [];

// Initialize camera on page load
async function initCamera() {
    try {
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        };

        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoElement = document.getElementById('video');
        videoElement.srcObject = videoStream;

        // Setup canvas for frame capture
        canvas = document.createElement('canvas');
        canvasCtx = canvas.getContext('2d');

        // Start continuous scanning
        startScanning();

        // Load initial stats
        loadStats();

        document.getElementById('toggleBtn').textContent = 'Stop Camera';
    } catch (error) {
        console.error('Camera access denied:', error);
        showStatus('Camera access denied. Please check browser permissions.', 'error');
    }
}

// Toggle camera
function toggleCamera() {
    if (videoStream) {
        // Stop camera
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
        document.getElementById('video').srcObject = null;
        document.getElementById('toggleBtn').textContent = 'Start Camera';
        
        if (scanningInterval) {
            clearInterval(scanningInterval);
            scanningInterval = null;
        }

        updateStatus('Camera stopped', 'info');
    } else {
        // Start camera
        initCamera();
    }
}

// Start continuous face scanning
function startScanning() {
    if (scanningInterval) clearInterval(scanningInterval);

    scanningInterval = setInterval(async () => {
        if (!videoStream) return;

        try {
            const video = document.getElementById('video');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw current video frame to canvas
            canvasCtx.drawImage(video, 0, 0);

            // Convert to base64 for API
            const imageData = canvas.toDataURL('image/jpeg', 0.8);

            // Send to backend for face detection and recognition
            await scanForAttendance(imageData);
        } catch (error) {
            console.error('Scanning error:', error);
        }
    }, 1000); // Scan every 1 second
}

// Scan image for faces and mark attendance
async function scanForAttendance(imageBase64) {
    try {
        // Extract base64 data without data URL prefix
        const base64data = imageBase64.includes(',') 
            ? imageBase64.split(',')[1] 
            : imageBase64;

        const response = await apiCall('/attendance/scan', 'POST', {
            image: base64data
        });

        if (response.faces && response.faces.length > 0) {
            updateStatus('✓ Face detected!', 'found');

            // Process each detected face
            for (const face of response.faces) {
                if (face.match && face.match.user_id && face.match.user_id !== 'unknown') {
                    const confidence = (face.confidence * 100).toFixed(1);

                    // Only mark if confidence is above 70% and user hasn't been marked today
                    if (confidence >= 70 && !scannedToday.has(face.match.user_id)) {
                        await markAttendance(face.match.user_id, confidence);
                        scannedToday.add(face.match.user_id);
                    }
                } else {
                    updateStatus('👤 Unknown face detected', 'info');
                }
            }
        } else {
            updateStatus('👁️ Scanning...', 'scanning');
        }
    } catch (error) {
        console.error('Attendance scan error:', error);
        // Don't show error every scan, just log it
    }
}

// Mark attendance for user
async function markAttendance(userId, confidence) {
    try {
        const response = await apiCall('/attendance/mark', 'POST', {
            user_id: userId,
            confidence: parseFloat(confidence)
        });

        if (response && response.user_name) {
            const message = `✓ ${response.user_name} marked present! (${confidence}% confidence)`;
            showStatus(message, 'success');

            // Add to recent scans
            addRecentScan(response.user_name, new Date());

            // Update stats
            loadStats();

            // Auto-hide message after 3 seconds
            setTimeout(() => {
                document.getElementById('statusMessage').style.display = 'none';
            }, 3000);
        }
    } catch (error) {
        console.error('Mark attendance error:', error);
    }
}

// Add scan to recent list
function addRecentScan(userName, timestamp) {
    const timeStr = formatTime(timestamp);
    recentScans.unshift({ name: userName, time: timeStr });

    // Keep only last 10 scans
    if (recentScans.length > 10) {
        recentScans.pop();
    }

    updateRecentList();
}

// Update recent scans display
function updateRecentList() {
    const list = document.getElementById('recentList');

    if (recentScans.length === 0) {
        list.innerHTML = `
            <p style="color: #64748b; text-align: center; padding: 2rem 0;">
                No scans yet today
            </p>
        `;
        return;
    }

    list.innerHTML = recentScans.map(scan => `
        <div class="scan-item">
            <div>
                <div class="scan-name">👤 ${scan.name}</div>
                <div class="scan-time">Marked as present</div>
            </div>
            <div class="scan-time">${scan.time}</div>
        </div>
    `).join('');
}

// Load today's statistics
async function loadStats() {
    try {
        const response = await apiCall('/stats/today', 'GET');

        if (response) {
            document.getElementById('totalPresent').textContent = response.present_count || '0';
            document.getElementById('totalScans').textContent = response.total_scans || '0';

            if (response.last_scan_time) {
                const time = new Date(response.last_scan_time);
                document.getElementById('lastScan').textContent = formatTime(time);
            }

            // Load recent scans
            if (response.recent_scans && Array.isArray(response.recent_scans)) {
                recentScans = response.recent_scans.map(scan => ({
                    name: scan.user_name || scan.name || 'Unknown',
                    time: formatTime(new Date(scan.timestamp || scan.time))
                }));
                updateRecentList();
            }
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Refresh statistics
function refreshStats() {
    loadStats();
    showStatus('Stats refreshed', 'success');
    
    setTimeout(() => {
        document.getElementById('statusMessage').style.display = 'none';
    }, 1500);
}

// Update status display
function updateStatus(message, status) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `detection-status ${status === 'found' ? 'found' : ''}`;
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
}

// Format time
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    loadNavbar();
});

// Navbar loading function
function loadNavbar() {
    fetch('../includes/navbar.html')
        .then(response => response.text())
        .then(html => {
            const navContainer = document.querySelector('[include-navbar]');
            if (navContainer) {
                navContainer.innerHTML = html;
            }
        })
        .catch(error => console.error('Failed to load navbar:', error));
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    if (scanningInterval) {
        clearInterval(scanningInterval);
    }
});
