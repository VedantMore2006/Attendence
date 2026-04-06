const App = {
    stream: null,
    capturedImages: [],


    // --- Media Helpers ---
    async startWebcam(videoId) {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            const video = document.getElementById(videoId);
            video.srcObject = this.stream;
        } catch (err) {
            console.error("Webcam Error:", err);
            alert("Could not access webcam. Please ensure permissions are granted.");
        }
    },

    captureFrame(videoId) {
        const video = document.getElementById(videoId);
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    },

    // --- Page: Scan ---
    async initScanPage() {
        await this.startWebcam('webcam');
        const overlay = document.getElementById('scan-overlay');
        const statusBox = document.getElementById('status-box');
        const statusMsg = document.getElementById('status-message');
        const statusDetail = document.getElementById('status-detail');

        overlay.innerText = "Scanning Active";

        // Poll API every 2 seconds 
        setInterval(async () => {
            try {
                const b64 = this.captureFrame('webcam');
                const result = await API.scanAttendance(b64);
                this.updateScanUI(result, statusBox, statusMsg, statusDetail);
            } catch (err) {
                statusMsg.innerText = "Connection Error";
                statusDetail.innerText = err.message;
            }
        }, 2000);
    },

    updateScanUI(res, box, msg, detail) {
        box.className = "status-box";
        msg.innerText = res.message || res.status;
        
        switch(res.status) {
            case 'marked':
                box.classList.add('status-success');
                detail.innerText = `Welcome, ${res.name}! Recorded at ${res.time}`;
                break;
            case 'already_marked':
                box.classList.add('status-warning');
                detail.innerText = `You checked in at ${res.time}`;
                break;
            case 'no_match':
                box.classList.add('status-error');
                detail.innerText = "Face not recognized. Please register.";
                break;
            default:
                box.classList.add('status-warning');
                detail.innerText = "Keep your face visible and still.";
        }
    },

    // --- Page: Register ---
    async initRegisterPage() {
        await this.startWebcam('webcam');
        const captureBtn = document.getElementById('capture-btn');
        const submitBtn = document.getElementById('submit-reg');
        const status = document.getElementById('reg-status');

        captureBtn.addEventListener('click', () => {
            if (this.capturedImages.length < 3) {
                const b64 = this.captureFrame('webcam');
                this.capturedImages.push(b64);
                captureBtn.innerText = `Capture Image (${this.capturedImages.length}/3)`;
                if (this.capturedImages.length === 3) submitBtn.disabled = false;
            }
        });

        submitBtn.addEventListener('click', async () => {
            const name = document.getElementById('username').value;
            if (!name) return alert("Please enter a name");
            
            submitBtn.disabled = true;
            status.innerText = "Processing registration...";
            status.classList.remove('hidden');

            const res = await API.registerUser(name, this.capturedImages);
            status.innerHTML = `
                <strong>Registration Success!</strong><br>
                Embeddings Stored: ${res.embeddings_stored}<br>
                Failed: ${res.embeddings_failed}
            `;
            this.capturedImages = [];
            captureBtn.innerText = "Capture Image (0/3)";
        });
    },

    // --- Data Loading ---
    async loadAttendance() {
        const data = await API.getAttendance();
        const body = document.getElementById('attendance-body');
        body.innerHTML = data.map(row => `
            <tr>
                <td>${row.user_id}</td>
                <td>${row.name}</td>
                <td>${row.date}</td>
                <td>${row.time}</td>
            </tr>
        `).join('');
    },

    async loadStats() {
        const stats = await API.getTodayStats();
        document.getElementById('stat-total').innerText = stats.total_users;
        document.getElementById('stat-present').innerText = stats.present_users;
        document.getElementById('stat-percent').innerText = stats.attendance_percent + "%";
    }
};
