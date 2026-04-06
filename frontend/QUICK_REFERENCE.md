# ⚡ Quick Reference Guide — Smart Attendance Frontend

## 🎯 What to Know Right Now

### Access the System
```bash
# Terminal 1: Start Backend
cd /home/vedant/Attendence
# Run your backend API on port 8000

# Terminal 2: Start Frontend
cd /home/vedant/Attendence/frontend
python -m http.server 8001

# Browser: Open
http://localhost:8001/index.html
```

### Project Tree (Important Files)
```
frontend/
├── index.html                    # START HERE
├── wizard/wizard.html            # System checks
├── register/register.html        # Register users ✅ BUG FIXED
├── scan/scan.html                # Real-time scanning
├── dashboard/dashboard.html      # View records
├── css/theme.css                 # All styling
├── js/common.js                  # All utilities
└── includes/navbar.html          # Navigation
```

---

## 🔌 API Endpoints Quick Ref

```javascript
// In any module, use:
const response = await apiCall('/endpoint', 'METHOD', body);

// Health
GET /api/health

// Stats
GET /api/stats/today

// Users
POST /api/users           // Register
GET /api/users           // List
DELETE /api/users/{id}   // Delete

// Attendance
POST /api/attendance/scan  // Face detection
POST /api/attendance/mark  // Manual mark
GET /api/attendance        // Records
```

---

## 🎨 CSS Quick Ref

### Colors (Edit in theme.css)
```css
--primary: #38bdf8;     /* Light blue */
--accent: #667eea;      /* Purple */
--accent-light: #764ba2; /* Purple dark */
--success: #10b981;     /* Green */
--warning: #f59e0b;     /* Amber */
--danger: #ef4444;      /* Red */
```

### Common Components
```html
<!-- Button -->
<button class="btn-primary">Click me</button>

<!-- Card -->
<div class="card">Content</div>

<!-- Table -->
<table>...</table>

<!-- Input -->
<input type="text" placeholder="...">
```

---

## 📝 Adding a New Module

1. **Create folder**: `frontend/newmodule/`
2. **Create files**:
   - `newmodule.html` (use template below)
   - `newmodule.js`
3. **Use template**:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Module — Smart Attendance</title>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
    <div include-navbar></div>
    
    <div class="container">
        <!-- Your content here -->
    </div>
    
    <script src="../js/common.js"></script>
    <script src="newmodule.js"></script>
</body>
</html>
```
4. **In your JS**:
```javascript
document.addEventListener('DOMContentLoaded', () => {
    loadNavbar();
    // Your code
});

function loadNavbar() {
    fetch('../includes/navbar.html')
        .then(response => response.text())
        .then(html => {
            document.querySelector('[include-navbar]').innerHTML = html;
        });
}
```
5. **Add to index.html** navigation

---

## 🐛 Common Issues & Fixes

### Issue: "Cannot GET /endpoint"
**Fix**: Check API is running on `http://localhost:8000/api`

### Issue: Navbar not showing
**Fix**: Check navbar.html exists in `/includes/` folder

### Issue: Styles not applied
**Fix**: Ensure `<link rel="stylesheet" href="../css/theme.css">` is in `<head>`

### Issue: Images not uploading
**Fix**: Check Network tab (F12 → Network), look for red requests

### Issue: Camera permission denied
**Fix**: Browser → Settings → Privacy & Security → Camera → Allow

---

## 📊 Key Variables (common.js)

```javascript
CONFIG.API_BASE          // API base URL
CONFIG.API_TIMEOUT       // Timeout in ms
CONFIG.SESSION_KEY       // localStorage key prefix
```

---

## 🎯 Module Responsibilities

| Module | Task |
|---|---|
| **wizard** | Verify backend, camera, model |
| **register** | Capture images, create users |
| **scan** | Real-time face detection |
| **dashboard** | View/manage attendance |

---

## 💡 Best Practices

✅ **Always use** `apiCall()` wrapper for API calls  
✅ **Always include** navbar in every module  
✅ **Always load** common.js before any API calls  
✅ **Always add** error handling for network errors  
✅ **Always test** responsive design (F12 → Toggle device toolbar)  

---

## 🧪 Testing Checklist

- [ ] Backend API responding on port 8000
- [ ] Frontend server running on port 8001
- [ ] Can access http://localhost:8001/index.html
- [ ] Wizard runs through all 5 checks
- [ ] Can register user without page reload
- [ ] Scanner detects faces in real-time
- [ ] Dashboard shows records and filters work
- [ ] Navbar visible on all pages (top-left)
- [ ] Responsive design works on mobile (F12)

---

## 🔥 Hot Tips

1. **Clear Cache**: Browser Cache (Ctrl+Shift+Delete) helps during development
2. **Console Logs**: Always check F12 Console for errors
3. **Network Tab**: Check Network tab to debug API issues
4. **Mobile Test**: F12 → Toggle Device Toolbar to test responsive design
5. **Local Storage**: Use dev tools Storage tab to inspect localStorage

---

## 📞 File Structure Reference

```
Any Module File (e.g., scan/scan.html)
    ↓
    └── Loads ../css/theme.css       (styling)
    └── Loads ../js/common.js        (utilities)
    └── Includes ../includes/navbar  (navigation)
    └── Loads scan.js                (logic)
```

---

## 🚀 Performance Tips

- Images: Keep JPEG quality at 0.8 (80%)
- Scanning: 1 image per second is optimal
- API Timeout: 10 seconds (increase if needed in common.js)
- Storage: ~5MB limit per origin

---

**Ready to go!** 🎉

For full documentation, read:
- `MODULAR_ARCHITECTURE.md` - Detailed architecture guide
- `REFACTOR_SUMMARY.md` - What was changed and why
