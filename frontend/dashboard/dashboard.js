// Dashboard state
let attendanceRecords = [];
let users = [];
let filteredRecords = [];

// Tab switching
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    setupTabs();
    loadNavbar();
});

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');

            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');

            // Load data for this tab
            if (tabName === 'records') {
                loadAttendanceRecords();
            } else if (tabName === 'users') {
                loadUsers();
            }
        });
    });
}

// Initialize dashboard
async function initDashboard() {
    // Set browser info
    document.getElementById('browserInfo').textContent = navigator.userAgent.split(' ').slice(-2).join(' ');
    document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString();

    // Load all initial data
    await loadStats();
    await loadAttendanceRecords();
    await loadUsers();
}

// Load dashboard statistics
async function loadStats() {
    try {
        // Get today's stats
        const statsToday = await apiCall('/stats/today', 'GET');
        document.getElementById('presentToday').textContent = statsToday.present_count || '0';
        document.getElementById('totalScans').textContent = statsToday.total_scans || '0';

        // Calculate attendance rate
        const totalUsers = statsToday.total_users || 0;
        const presentCount = statsToday.present_count || 0;
        const rate = totalUsers > 0 ? ((presentCount / totalUsers) * 100).toFixed(0) : 0;
        document.getElementById('attendanceRate').textContent = rate + '%';

        // Get user count
        const usersResponse = await apiCall('/users', 'GET');
        if (Array.isArray(usersResponse)) {
            document.getElementById('totalUsers').textContent = usersResponse.length;
        } else if (usersResponse.users && Array.isArray(usersResponse.users)) {
            document.getElementById('totalUsers').textContent = usersResponse.users.length;
        }

        // Update API endpoint display
        document.getElementById('apiEndpoint').textContent = `API Base: ${CONFIG.API_BASE}`;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load attendance records
async function loadAttendanceRecords() {
    try {
        const response = await apiCall('/attendance', 'GET');
        attendanceRecords = Array.isArray(response) ? response : response.records || [];

        // Display all records
        displayRecords(attendanceRecords);
    } catch (error) {
        console.error('Failed to load records:', error);
        document.getElementById('recordsList').innerHTML = `
            <tr><td colspan="6" class="no-data">Failed to load records: ${error.message}</td></tr>
        `;
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await apiCall('/users', 'GET');
        users = Array.isArray(response) ? response : response.users || [];

        displayUsers(users);
    } catch (error) {
        console.error('Failed to load users:', error);
        document.getElementById('usersList').innerHTML = `
            <tr><td colspan="6" class="no-data">Failed to load users: ${error.message}</td></tr>
        `;
    }
}

// Display attendance records in table
function displayRecords(records) {
    const tbody = document.getElementById('recordsList');

    if (records.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="no-data">No attendance records found</td></tr>
        `;
        return;
    }

    tbody.innerHTML = records.map(record => {
        const timestamp = new Date(record.timestamp || record.time);
        const date = timestamp.toLocaleDateString();
        const time = timestamp.toLocaleTimeString();
        const status = record.status || 'present';
        const confidence = record.confidence ? (record.confidence * 100).toFixed(1) : '--';

        return `
            <tr>
                <td>${record.user_name || record.name || 'Unknown'}</td>
                <td>${date}</td>
                <td>${time}</td>
                <td><span class="badge ${status}">${status.toUpperCase()}</span></td>
                <td>${confidence}%</td>
                <td>${record.device || 'Webcam'}</td>
            </tr>
        `;
    }).join('');
}

// Display users in table
function displayUsers(userList) {
    const tbody = document.getElementById('usersList');

    if (userList.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="no-data">No users registered</td></tr>
        `;
        return;
    }

    tbody.innerHTML = userList.map(user => {
        const regDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : '--';
        const imageCount = user.image_count || 0;

        return `
            <tr>
                <td>${user.name || 'Unknown'}</td>
                <td>${user.email || '--'}</td>
                <td>${user.department || '--'}</td>
                <td>${regDate}</td>
                <td><span class="badge">${imageCount} images</span></td>
                <td>
                    <button class="btn-sm" onclick="deleteUser('${user.id || user.user_id}', '${user.name}')">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter records
function filterRecords() {
    const dateFilter = document.getElementById('filterDate').value;
    const userFilter = document.getElementById('filterUser').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;

    filteredRecords = attendanceRecords.filter(record => {
        const timestamp = new Date(record.timestamp || record.time);
        const date = timestamp.toISOString().split('T')[0];
        const userName = (record.user_name || record.name || '').toLowerCase();
        const recordStatus = (record.status || 'present').toLowerCase();

        let match = true;
        if (dateFilter && date !== dateFilter) match = false;
        if (userFilter && !userName.includes(userFilter)) match = false;
        if (statusFilter && recordStatus !== statusFilter) match = false;

        return match;
    });

    displayRecords(filteredRecords);
}

// Filter users
function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();

    const filtered = users.filter(user => {
        const name = (user.name || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const dept = (user.department || '').toLowerCase();

        return name.includes(searchTerm) || email.includes(searchTerm) || dept.includes(searchTerm);
    });

    displayUsers(filtered);
}

// Export to CSV
function exportToCSV() {
    const records = filteredRecords.length > 0 ? filteredRecords : attendanceRecords;

    if (records.length === 0) {
        alert('No records to export');
        return;
    }

    let csv = 'User Name,Date,Time,Status,Confidence,Device\n';

    records.forEach(record => {
        const timestamp = new Date(record.timestamp || record.time);
        const date = timestamp.toLocaleDateString();
        const time = timestamp.toLocaleTimeString();
        const status = record.status || 'present';
        const confidence = record.confidence ? (record.confidence * 100).toFixed(1) : '--';
        const device = record.device || 'Webcam';

        const name = (record.user_name || record.name || 'Unknown').replace(/"/g, '""');
        csv += `"${name}","${date}","${time}","${status}","${confidence}%","${device}"\n`;
    });

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Delete user
async function deleteUser(userId, userName) {
    if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) {
        return;
    }

    try {
        await apiCall(`/users/${userId}`, 'DELETE');
        alert('User deleted successfully');
        loadUsers(); // Reload users list
        loadStats(); // Update stats
    } catch (error) {
        alert('Failed to delete user: ' + error.message);
    }
}

// Refresh all statistics
function refreshAllStats() {
    loadStats();
    alert('Statistics refreshed');
}

// Clear cache
function clearAllCache() {
    localStorage.clear();
    alert('Cache cleared');
    location.reload();
}

// Download report
function downloadReport() {
    const now = new Date();
    const report = `
Attendance System Report
Generated: ${now.toLocaleString()}

SUMMARY
Total Users: ${document.getElementById('totalUsers').textContent}
Present Today: ${document.getElementById('presentToday').textContent}
Attendance Rate: ${document.getElementById('attendanceRate').textContent}
Total Scans: ${document.getElementById('totalScans').textContent}

API ENDPOINT: ${CONFIG.API_BASE}
BROWSER: ${navigator.userAgent}
    `.trim();

    const blob = new Blob([report], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${now.toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

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
