// Wizard Steps Definition
const steps = [
    {
        id: 'backend',
        title: 'Backend Connection',
        desc: 'Verify connection to attendance service',
        check: checkBackendHealth
    },
    {
        id: 'model',
        title: 'Face Recognition Model',
        desc: 'Ensure AI model is loaded and ready',
        check: checkModel
    },
    {
        id: 'camera',
        title: 'Camera Access',
        desc: 'Request access to webcam',
        check: checkCameraAccess
    },
    {
        id: 'capture',
        title: 'Test Image Capture',
        desc: 'Capture a test frame from camera',
        check: testCapture
    },
    {
        id: 'process',
        title: 'Face Detection',
        desc: 'Verify face detection works',
        check: testProcessing
    }
];

let videoStream = null;
let videoElement = null;
let canvas = null;
let canvasCtx = null;

// Initialize wizard UI
function initWizard() {
    const container = document.getElementById('stepsContainer');
    container.innerHTML = steps.map((step, idx) => `
        <div class="step" id="step-${step.id}">
            <div class="step-header">
                <div class="step-number">${idx + 1}</div>
                <div class="step-info">
                    <h3>${step.title}</h3>
                    <p>${step.desc}</p>
                </div>
                <div class="step-status">
                    <span id="status-text-${step.id}" class="status-text">Pending</span>
                    <span class="status-dot" id="status-dot-${step.id}"></span>
                </div>
            </div>
            <div class="step-content" id="content-${step.id}">
                <div class="log-box" id="log-${step.id}"></div>
            </div>
        </div>
    `).join('');
}

// Update step status
function updateStep(stepId, status, logs = []) {
    const step = document.getElementById(`step-${stepId}`);
    const statusDot = document.getElementById(`status-dot-${stepId}`);
    const statusText = document.getElementById(`status-text-${stepId}`);
    const logBox = document.getElementById(`log-${stepId}`);
    const content = document.getElementById(`content-${stepId}`);

    step.classList.remove('pending', 'completed');
    statusDot.className = 'status-dot';

    if (status === 'loading') {
        statusDot.classList.add('loading');
        statusText.textContent = 'Running...';
    } else if (status === 'success') {
        statusDot.classList.add('success');
        statusText.textContent = 'Success';
        step.classList.add('completed');
        content.classList.remove('active');
    } else if (status === 'error') {
        statusDot.classList.add('error');
        statusText.textContent = 'Failed';
        content.classList.add('active');
    }

    if (logs.length > 0) {
        logBox.innerHTML = logs.map(log => {
            const type = log.type || 'info';
            return `<div class="log-entry ${type}">${escapeHtml(log.message)}</div>`;
        }).join('');
        content.classList.add('active');
    }

    updateProgress();
}

// Check backend health
async function checkBackendHealth() {
    try {
        updateStep('backend', 'loading');
        const response = await apiCall('/health', 'GET');
        const logs = [
            { type: 'success', message: `✓ Backend connected` },
            { type: 'info', message: `Status: ${response.status}` },
            { type: 'info', message: `Version: ${response.version || 'N/A'}` }
        ];
        updateStep('backend', 'success', logs);
        return true;
    } catch (error) {
        updateStep('backend', 'error', [
            { type: 'error', message: `✗ Cannot reach backend` },
            { type: 'error', message: `Error: ${error.message}` },
            { type: 'warn', message: `Ensure server is running on ${CONFIG.API_BASE}` }
        ]);
        return false;
    }
}

// Check AI model
async function checkModel() {
    try {
        updateStep('model', 'loading');
        const response = await apiCall('/health', 'GET');
        
        const logs = [
            { type: 'info', message: 'Checking model status...' }
        ];

        if (response.model_loaded) {
            logs.push({ type: 'success', message: '✓ Face recognition model loaded' });
            logs.push({ type: 'info', message: `Model: ${response.model_name || 'Buffalo_l'}` });
            updateStep('model', 'success', logs);
            return true;
        } else {
            logs.push({ type: 'warn', message: 'Model loading (lazy loading enabled)' });
            logs.push({ type: 'info', message: 'Will load on first use' });
            updateStep('model', 'success', logs);
            return true;
        }
    } catch (error) {
        updateStep('model', 'error', [
            { type: 'error', message: '✗ Cannot verify model' },
            { type: 'error', message: error.message }
        ]);
        return false;
    }
}

// Check camera access
async function checkCameraAccess() {
    try {
        updateStep('camera', 'loading');
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        if (videoDevices.length === 0) {
            updateStep('camera', 'error', [
                { type: 'error', message: '✗ No camera devices found' }
            ]);
            return false;
        }

        const constraints = { 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false 
        };

        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const logs = [
            { type: 'success', message: '✓ Camera access granted' },
            { type: 'info', message: `Cameras found: ${videoDevices.length}` }
        ];

        const settings = videoStream.getVideoTracks()[0].getSettings();
        logs.push({ type: 'info', message: `Resolution: ${settings.width}×${settings.height}` });

        updateStep('camera', 'success', logs);
        return true;
    } catch (error) {
        updateStep('camera', 'error', [
            { type: 'error', message: '✗ Camera access denied' },
            { type: 'error', message: error.message },
            { type: 'warn', message: 'Please allow camera access in browser settings' }
        ]);
        return false;
    }
}

// Test image capture
async function testCapture() {
    try {
        if (!videoStream) {
            updateStep('capture', 'error', [
                { type: 'error', message: '✗ Camera not available' }
            ]);
            return false;
        }

        updateStep('capture', 'loading');

        // Create offscreen video and canvas
        videoElement = document.createElement('video');
        videoElement.srcObject = videoStream;
        videoElement.play();

        // Wait for video to play
        await new Promise(resolve => {
            videoElement.onloadedmetadata = resolve;
        });

        canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        canvasCtx = canvas.getContext('2d');

        // Capture frame
        await new Promise(resolve => setTimeout(resolve, 500));
        canvasCtx.drawImage(videoElement, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        const logs = [
            { type: 'success', message: '✓ Frame captured successfully' },
            { type: 'info', message: `Resolution: ${canvas.width}×${canvas.height}` },
            { type: 'info', message: `Size: ${(imageData.length / 1024).toFixed(2)} KB` }
        ];

        updateStep('capture', 'success', logs);
        return true;
    } catch (error) {
        updateStep('capture', 'error', [
            { type: 'error', message: '✗ Frame capture failed' },
            { type: 'error', message: error.message }
        ]);
        return false;
    }
}

// Test processing (face detection)
async function testProcessing() {
    try {
        if (!canvas) {
            updateStep('process', 'error', [
                { type: 'error', message: '✗ No captured frame available' }
            ]);
            return false;
        }

        updateStep('process', 'loading');

        const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        const response = await apiCall('/attendance/scan', 'POST', {
            image: imageBase64
        });

        const logs = [
            { type: 'success', message: '✓ Face detection processed' }
        ];

        if (response.faces && response.faces.length > 0) {
            logs.push({ type: 'success', message: `✓ ${response.faces.length} face(s) detected` });
            response.faces.forEach((face, idx) => {
                const conf = (face.confidence * 100).toFixed(1);
                logs.push({ type: 'info', message: `  Face ${idx + 1}: ${conf}% confidence` });
            });
        } else {
            logs.push({ type: 'warn', message: 'No faces detected in frame (this is OK for testing)' });
            logs.push({ type: 'info', message: 'Ensure face is clearly visible when using the system' });
        }

        updateStep('process', 'success', logs);

        // Show summary
        document.getElementById('summaryBox').classList.add('visible');
        return true;
    } catch (error) {
        updateStep('process', 'error', [
            { type: 'error', message: '✗ Processing failed' },
            { type: 'error', message: error.message }
        ]);
        return false;
    } finally {
        // Clean up
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }
    }
}

// Update progress bar
function updateProgress() {
    const total = steps.length;
    const completed = document.querySelectorAll('.step.completed').length;
    const percent = (completed / total) * 100;
    document.getElementById('progressFill').style.width = percent + '%';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Run wizard sequentially
async function runWizard() {
    for (const step of steps) {
        if (!await step.check()) {
            console.warn(`Wizard stopped at: ${step.title}`);
            break;
        }
        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initWizard();
    setTimeout(runWizard, 500);
});
