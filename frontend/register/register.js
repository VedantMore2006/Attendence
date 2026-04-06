// Global state
let videoStream = null;
let canvas = null;
let canvasCtx = null;
let capturedImages = [];
let isUploading = false;

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

        // Setup canvas for captures
        canvas = document.createElement('canvas');
        canvasCtx = canvas.getContext('2d');

        document.getElementById('cameraBtn').textContent = 'Stop Camera';
    } catch (error) {
        console.error('Camera access denied:', error);
        showStatus('Camera access denied. Please check browser permissions.', 'error');
        document.getElementById('captureBtn').disabled = true;
    }
}

// Toggle camera
function toggleCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
        document.getElementById('video').srcObject = null;
        document.getElementById('cameraBtn').textContent = 'Start Camera';
        document.getElementById('captureBtn').disabled = true;
    } else {
        initCamera();
    }
}

// Capture image from video
async function captureImage() {
    if (!videoStream) {
        showStatus('Camera is not active', 'error');
        return;
    }

    try {
        const video = document.getElementById('video');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current video frame to canvas
        canvasCtx.drawImage(video, 0, 0);

        // Convert to base64
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        capturedImages.push(imageData);

        // Update UI
        updateImagePreview();
        document.getElementById('imageCount').textContent = capturedImages.length;

        showStatus(`Image ${capturedImages.length} captured successfully!`, 'success');

        // Auto-hide message after 2 seconds
        setTimeout(() => {
            document.getElementById('statusMessage').style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('Capture error:', error);
        showStatus('Failed to capture image: ' + error.message, 'error');
    }
}

// Update image preview grid
function updateImagePreview() {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = capturedImages.map((img, idx) => `
        <div class="image-thumb">
            <img src="${img}" alt="Captured image ${idx + 1}">
        </div>
    `).join('');
}

// Register user with captured images
async function registerUser(event) {
    // Prevent form submission and page reload
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // Check if already uploading (CRITICAL FIX for page reload bug)
    if (isUploading) {
        console.warn('Upload already in progress');
        return;
    }

    // Validate inputs
    const fullName = document.getElementById('fullName').value.trim();
    
    if (!fullName) {
        showStatus('Please enter a full name', 'error');
        return;
    }

    if (capturedImages.length === 0) {
        showStatus('Please capture at least one image', 'error');
        return;
    }

    // Disable button and set uploading state
    isUploading = true;
    const btn = document.getElementById('registerBtn');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.textContent = 'Registering...';

    try {
        const payload = {
            name: fullName,
            email: document.getElementById('email').value.trim() || undefined,
            department: document.getElementById('department').value.trim() || undefined,
            images: capturedImages
        };

        // Remove undefined fields
        Object.keys(payload).forEach(key => 
            payload[key] === undefined && delete payload[key]
        );

        console.log(`Uploading ${capturedImages.length} images for ${fullName}...`);

        const response = await apiCall('/users', 'POST', payload);

        if (response && response.id) {
            showStatus(`✓ User "${fullName}" registered successfully!`, 'success');
            
            // Clear form for next registration
            document.getElementById('fullName').value = '';
            document.getElementById('email').value = '';
            document.getElementById('department').value = '';
            capturedImages = [];
            updateImagePreview();
            document.getElementById('imageCount').textContent = '0';

            console.log('Registration successful:', response);
        } else {
            showStatus('Registration completed but no confirmation received', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showStatus('Failed to register user: ' + error.message, 'error');
    } finally {
        // CRITICAL: Always re-enable button even if error
        isUploading = false;
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.textContent = originalText;
    }
}

// Clear all captured images
function clearAll() {
    if (capturedImages.length === 0) {
        return;
    }

    if (confirm('Clear all captured images?')) {
        capturedImages = [];
        updateImagePreview();
        document.getElementById('imageCount').textContent = '0';
        showStatus('Cleared all images', 'success');
        
        setTimeout(() => {
            document.getElementById('statusMessage').style.display = 'none';
        }, 2000);
    }
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    
    // Load navbar
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
