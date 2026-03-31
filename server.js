const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'carmel_garden_super_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Multer Storage for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/');
    },
    filename: (req, file, cb) => {
        // Keeps the original extension but adds a timestamp to avoid caching/overwrites
        const ext = path.extname(file.originalname);
        const name = file.fieldname + '-' + Date.now() + ext;
        cb(null, name);
    }
});
const upload = multer({ storage: storage });

// Security Middleware
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded credentials for the demo
    if (username === 'admin' && password === 'admin123') {
        req.session.admin = true;
        res.json({ success: true, message: 'Logged in successfully' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.admin) {
        res.json({ loggedIn: true });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// --- CONTENT ROUTES ---

// Helper to read DB
const readDB = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
// Helper to write DB
const writeDB = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

// Get all content (Public)
app.get('/api/content', (req, res) => {
    try {
        const data = readDB();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read database' });
    }
});

// Update text/link/faq content (Admin only)
app.post('/api/content', requireAdmin, (req, res) => {
    try {
        const db = readDB();
        if (req.body.texts) {
            db.texts = { ...db.texts, ...req.body.texts };
        }
        if (req.body.links) {
            db.links = { ...db.links, ...req.body.links };
        }
        if (req.body.faqs) {
            if (!db.faqs) db.faqs = {};
            db.faqs = { ...db.faqs, ...req.body.faqs };
        }
        writeDB(db);
        res.json({ success: true, message: 'Content updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update content' });
    }
});

// Upload image (Admin only)
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
        const db = readDB();
        const imageKey = req.body.imageKey; 
        
        db.images[imageKey] = `url('images/${req.file.filename}')`;
        writeDB(db);

        res.json({ success: true, message: 'Image uploaded and updated!', filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save image reference' });
    }
});

// Upload Brochure PDF (Admin only)
app.post('/api/upload-brochure', requireAdmin, upload.single('brochure'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
        const db = readDB();
        const linkKey = req.body.linkKey; 
        
        if (!db.links) db.links = {};
        db.links[linkKey] = `images/${req.file.filename}`; // saved in public/images folder
        writeDB(db);

        res.json({ success: true, message: 'Brochure uploaded successfully!', filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save brochure reference' });
    }
});

// Upload Gallery Image (Admin only)
app.post('/api/upload-gallery', requireAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const eventName = req.body.eventName;
    if (!eventName) {
        return res.status(400).json({ error: 'Event name is required' });
    }
    try {
        const db = readDB();
        if (!db.gallery) db.gallery = {};
        if (!db.gallery[eventName]) db.gallery[eventName] = [];
        
        // Add the image path to the specific event's array
        db.gallery[eventName].push(`images/${req.file.filename}`);
        writeDB(db);

        res.json({ success: true, message: `Image added to ${eventName} successfully!`, filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save gallery image reference' });
    }
});

// Auto-Responder Chatbot Logic
app.post('/api/chat', (req, res) => {
    const userMessage = req.body.message ? req.body.message.toLowerCase() : '';
    const db = readDB();
    const faqs = db.faqs || {};
    
    let reply = "I'm a virtual assistant. If you have urgent questions, please contact admin@carmelgarden.edu.in.";
    
    // Keyword matching
    if (userMessage.includes('admission') || userMessage.includes('apply') || userMessage.includes('enroll')) {
        reply = faqs['cms-faq-admission'] || "Admissions are currently open. Please click 'Apply Now'.";
    } else if (userMessage.includes('fee') || userMessage.includes('cost') || userMessage.includes('tuition')) {
        reply = faqs['cms-faq-fees'] || "Please check the admin office for fee structures.";
    } else if (userMessage.includes('location') || userMessage.includes('address') || userMessage.includes('where')) {
        reply = faqs['cms-faq-location'] || "We are located at Coimbatore.";
    } else if (userMessage.includes('hi') || userMessage.includes('hello')) {
        reply = "Hello! 👋 Welcome to Carmel Garden. Would you like to know about Admissions, Fees, or our Location?";
    }
    
    // Simulate thinking delay for realism
    setTimeout(() => {
        res.json({ reply });
    }, 600);
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
