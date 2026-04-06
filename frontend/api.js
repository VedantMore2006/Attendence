const API_BASE = "http://127.0.0.1:8000/api";

const API = {
    async checkHealth() {
        const res = await fetch(`${API_BASE}/health`);
        return res.json();
    },

    async scanAttendance(imageBase64) {
        const response = await fetch(`${API_BASE}/attendance/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageBase64 })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Server error");
        }
        return response.json();
    },

    async registerUser(name, images) {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, images })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Registration failed");
        }
        return response.json();
    },

    async getAttendance(date = null) {
        const url = date ? `${API_BASE}/attendance?date=${date}` : `${API_BASE}/attendance`;
        const response = await fetch(url);
        return response.json();
    },

    async getTodayStats() {
        const response = await fetch(`${API_BASE}/stats/today`);
        return response.json();
    },

    async getUsers() {
        const response = await fetch(`${API_BASE}/users`);
        return response.json();
    },

    async deleteUser(userId) {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        return true;
    },

    async getRecentScanEvents() {
        const response = await fetch(`${API_BASE}/logs/recent`);
        return response.json();
    }
};

// Toast notification helper
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}