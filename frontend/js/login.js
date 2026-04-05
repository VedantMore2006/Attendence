document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    
    // Check if already 'logged in' (mock)
    if (sessionStorage.getItem('auth_token')) {
        window.location.href = 'dashboard.html';
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = loginForm.querySelector('button[type="submit"]');

        if (username && password) {
            // Show loading state
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<span style="animation: pulse 1.5s infinite;">Authenticating...</span>';
            btn.disabled = true;

            // Mock authentication delay
            setTimeout(() => {
                // Set mock JWT token
                sessionStorage.setItem('auth_token', 'mock_jwt_token_for_prototype');
                sessionStorage.setItem('admin_user', username);
                
                // Redirect to dashboard
                window.location.href = 'dashboard.html';
            }, 800);
        }
    });
});

// Simple pulse animation for loading state
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
    }
`;
document.head.appendChild(style);
