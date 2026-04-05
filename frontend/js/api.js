const API_BASE_URL = 'http://127.0.0.1:8000/api';

/**
 * Handle API interactions
 */
const API = {
    /**
     * Get system health status
     */
    async getHealth() {
        try {
            const res = await fetch(`${API_BASE_URL}/health`);
            if (!res.ok) throw new Error('API not reachable');
            return await res.json();
        } catch (error) {
            console.error('API Error:', error);
            return { status: 'error', message: error.message };
        }
    },

    /**
     * Get today's attendance stats
     */
    async getStatsToday() {
        try {
            const res = await fetch(`${API_BASE_URL}/stats/today`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            return await res.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    },

    /**
     * Get list of users
     */
    async getUsers() {
        try {
            const res = await fetch(`${API_BASE_URL}/users`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return await res.json();
        } catch (error) {
            console.error('API Error:', error);
            return [];
        }
    },

    /**
     * Create a new user
     */
    async createUser(data) {
        try {
            const res = await fetch(`${API_BASE_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('Failed to create user');
            return await res.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    },

    /**
     * Scan attendance from a captured image.
     * Always returns an object — never null — so callers can inspect result.status.
     * On network failure returns { status: 'network_error', message: '...' }.
     * On API error returns  { status: 'api_error',     message: '...', http_status }.
     */
    async scanAttendance(imageData) {
        let res;
        try {
            res = await fetch(`${API_BASE_URL}/attendance/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
        } catch (networkErr) {
            console.error('Network error in scanAttendance:', networkErr);
            return { status: 'network_error', message: 'Cannot reach the server. Is it running?' };
        }

        let data;
        try {
            data = await res.json();
        } catch {
            return { status: 'api_error', message: `Server returned non-JSON (HTTP ${res.status})`, http_status: res.status };
        }

        if (!res.ok) {
            console.warn('scanAttendance API error:', res.status, data);
            return {
                status: 'api_error',
                message: data.error || `API error (HTTP ${res.status})`,
                error_type: data.type || 'UnknownError',
                http_status: res.status,
            };
        }

        return data;
    },

    /**
     * Get attendance records (optionally filter by date YYYY-MM-DD)
     */
    async getAttendance(date = null) {
        try {
            const url = date ? `${API_BASE_URL}/attendance?date=${date}` : `${API_BASE_URL}/attendance`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch attendance');
            return await res.json();
        } catch (error) {
            console.error('API Error:', error);
            return [];
        }
    },

    /**
     * Delete a user and cascade-delete embeddings + attendance records
     */
    async deleteUser(userId) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`Failed to delete user (HTTP ${res.status})`);
            return true;
        } catch (error) {
            console.error('API Error deleting user:', error);
            return false;
        }
    }
};

window.API = API;
