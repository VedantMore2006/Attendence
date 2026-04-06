/**
 * SHARED CONFIG
 */
const CONFIG = {
    API_BASE: 'http://127.0.0.1:8000/api',
    DEBUG: true,
    SCAN_INTERVAL: 2000,      // ms between scans
    STATS_REFRESH: 30000,     // ms between stats updates
    IMAGE_QUALITY: 0.9,       // JPEG quality 0-1
    TOAST_DURATION: 4000      // ms toast display time
};

/**
 * LOGGING UTILITY
 */
const Logger = {
    log: (message, data) => {
        if (CONFIG.DEBUG) {
            console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data || '');
        }
    },
    error: (message, error) => {
        console.error(`[ERROR] ${message}`, error || '');
    },
    warn: (message, data) => {
        console.warn(`[WARN] ${message}`, data || '');
    }
};

/**
 * MESSAGE/TOAST UTILITY
 */
const Toast = {
    show: (message, type = 'info') => {
        const toastContainer = document.getElementById('toastContainer') || Toast.createContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
        `;
        toastContainer.appendChild(toast);
        
        setTimeout(() => toast.remove(), CONFIG.TOAST_DURATION);
    },
    createContainer: () => {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
        return container;
    },
    success: (msg) => Toast.show(msg, 'success'),
    error: (msg) => Toast.show(msg, 'error'),
    warning: (msg) => Toast.show(msg, 'warning'),
    info: (msg) => Toast.show(msg, 'info')
};

// Add toast styles
if (!document.getElementById('toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
        .toast {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1rem 1.5rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #cbd5e1;
            animation: slideIn 0.3s ease;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .toast-success {
            border-color: rgba(16, 185, 129, 0.3);
            background: rgba(16, 185, 129, 0.1);
            color: #86efac;
        }
        .toast-error {
            border-color: rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.1);
            color: #fca5a5;
        }
        .toast-warning {
            border-color: rgba(245, 158, 11, 0.3);
            background: rgba(245, 158, 11, 0.1);
            color: #fcd34d;
        }
        .toast-info {
            border-color: rgba(56, 189, 248, 0.3);
            background: rgba(56, 189, 248, 0.1);
            color: #93c5fd;
        }
        .toast-close {
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
            font-size: 1.2rem;
            padding: 0;
        }
        .toast-close:hover {
            opacity: 0.7;
        }
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * API UTILITY - Handle all backend calls
 */
const API = {
    /**
     * Generic fetch wrapper with error handling
     */
    call: async (endpoint, options = {}) => {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        const defaultOptions = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw {
                    status: response.status,
                    message: data.error || data.detail || 'API request failed',
                    data
                };
            }

            return { success: true, data, status: response.status };
        } catch (error) {
            Logger.error(`API Error on ${endpoint}:`, error);
            return {
                success: false,
                error: error.message || 'Network error',
                status: error.status || 0
            };
        }
    },

    /**
     * Health check
     */
    health: async () => API.call('/health'),

    /**
     * Stats for today
     */
    statsToday: async () => API.call('/stats/today'),

    /**
     * Register user with images
     */
    registerUser: async (name, images) => API.call('/users', {
        method: 'POST',
        body: JSON.stringify({ name, images })
    }),

    /**
     * Get all users
     */
    getUsers: async () => API.call('/users'),

    /**
     * Delete user
     */
    deleteUser: async (userId) => API.call(`/users/${userId}`, {
        method: 'DELETE'
    }),

    /**
     * Scan for attendance
     */
    scanAttendance: async (image) => API.call('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({ image })
    }),

    /**
     * Manual mark attendance
     */
    markAttendance: async (userId) => API.call('/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
    }),

    /**
     * Get attendance records
     */
    getAttendance: async (date = null) => {
        const params = date ? `?date=${date}` : '';
        return API.call(`/attendance${params}`);
    }
};

/**
 * STORAGE UTILITY
 */
const Storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            Logger.warn('Storage.set failed:', error);
        }
    },
    get: (key) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            Logger.warn('Storage.get failed:', error);
            return null;
        }
    },
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            Logger.warn('Storage.remove failed:', error);
        }
    },
    clear: () => {
        try {
            localStorage.clear();
        } catch (error) {
            Logger.warn('Storage.clear failed:', error);
        }
    }
};

/**
 * IMAGE UTILITY
 */
const ImageUtils = {
    /**
     * Capture frame from video element as base64
     */
    captureFrame: (videoElement, quality = CONFIG.IMAGE_QUALITY) => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            return canvas.toDataURL('image/jpeg', quality);
        } catch (error) {
            Logger.error('captureFrame failed:', error);
            return null;
        }
    },

    /**
     * Compress image from data URL
     */
    compress: (dataURL, quality = 0.7) => {
        try {
            const img = new Image();
            img.src = dataURL;
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            return canvas.toDataURL('image/jpeg', quality);
        } catch (error) {
            Logger.error('compress failed:', error);
            return dataURL;
        }
    },

    /**
     * Get data URL size in KB
     */
    getSize: (dataURL) => {
        const bytes = Math.ceil((dataURL.length * 3) / 4);
        return (bytes / 1024).toFixed(2);
    }
};

/**
 * DATE UTILITY
 */
const DateUtils = {
    today: () => new Date().toISOString().split('T')[0],
    
    format: (date, format = 'YYYY-MM-DD HH:MM:SS') => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    },

    time: () => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }
};

/**
 * DOM UTILITY
 */
const DOM = {
    show: (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.style.display = '';
    },
    
    hide: (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.style.display = 'none';
    },

    toggle: (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
    },

    addClass: (selector, className) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.classList.add(className);
    },

    removeClass: (selector, className) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.classList.remove(className);
    },

    toggleClass: (selector, className) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.classList.toggle(className);
    },

    setText: (selector, text) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.textContent = text;
    },

    setHTML: (selector, html) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.innerHTML = html;
    },

    getValue: (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        return el ? el.value : '';
    },

    setValue: (selector, value) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.value = value;
    },

    disable: (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.disabled = true;
    },

    enable: (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) el.disabled = false;
    }
};

/**
 * VALIDATION UTILITY
 */
const Validation = {
    isEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    
    isEmpty: (value) => !value || value.trim() === '',
    
    isNumber: (value) => !isNaN(parseFloat(value)) && isFinite(value),
    
    minLength: (value, min) => value.length >= min,
    
    maxLength: (value, max) => value.length <= max
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, Logger, Toast, API, Storage, ImageUtils, DateUtils, DOM, Validation };
}
