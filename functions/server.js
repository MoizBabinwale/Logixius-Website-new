require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory (for local development)
// In production, Firebase Hosting serves these directly
app.use(express.static(path.join(__dirname, '..', 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Configuration with PostgreSQL session store
app.use(session({
    store: new PgSession({
        pool: db,
        tableName: 'user_sessions',
        createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    }
}));

const bcrypt = require('bcrypt');
const multer = require('multer');
const QRCode = require('qrcode');
const fs = require('fs');

// Firebase Admin for Cloud Storage
const admin = require('firebase-admin');

// Initialize Firebase Admin (uses default credentials in Cloud Functions)
if (!admin.apps.length) {
    admin.initializeApp({
        storageBucket: process.env.STORAGE_BUCKET || undefined,
    });
}

// Lazy getter for storage bucket — avoids crash if STORAGE_BUCKET not set during startup
function getBucket() {
    return admin.storage().bucket();
}

// Configure Multer for file uploads using memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Upload a file buffer to Firebase Cloud Storage
 * @param {Buffer} buffer - File buffer
 * @param {string} originalName - Original filename
 * @param {string} folder - Storage folder (e.g., 'certificates', 'offer-letters')
 * @returns {string} Public URL of the uploaded file
 */
async function uploadToStorage(buffer, originalName, folder) {
    const storageBucket = getBucket();
    const fileName = `${folder}/${Date.now()}_${originalName}`;
    const file = storageBucket.file(fileName);

    await file.save(buffer, {
        metadata: {
            contentType: getContentType(originalName),
        },
    });

    // Make the file publicly readable
    await file.makePublic();

    return `https://storage.googleapis.com/${storageBucket.name}/${fileName}`;
}

function getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
    };
    return types[ext] || 'application/octet-stream';
}

// ==========================================
// ROUTES
// ==========================================

// Gallery Page
app.get('/gallery', async (req, res) => {
    let groupedImages = {};
    try {
        const dataPath = path.join(__dirname, 'gallery-data.json');
        const fileContent = await fs.promises.readFile(dataPath, 'utf8');
        groupedImages = JSON.parse(fileContent);
        res.locals.galleryGroups = groupedImages;
        res.render('gallery');
    } catch (err) {
        console.error('Error reading gallery data: ' + err);
        res.status(500).send('Server Error: ' + err.stack);
    }
});

// Main static page (fallback for local dev — Firebase Hosting serves index.html in prod)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Workshops Route
app.get('/workshops', (req, res) => {
    res.render('workshops');
});

// Expert Sessions Route
app.get('/expert-sessions', (req, res) => {
    res.render('expert-sessions');
});

// Industrial Projects Route
app.get('/industrial-projects', (req, res) => {
    res.render('industrial-projects');
});

// Corporate Training Route
app.get('/corporate-training', (req, res) => {
    res.render('corporate-training');
});

// Admin Login Page
app.get('/admin/login', (req, res) => {
    res.render('admin-login', { error: null });
});

// Admin Login Handler
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`Login Attempt: ${username}`);
    try {
        const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
        const rows = result.rows;
        console.log('DB Search Result:', rows);

        if (rows.length > 0) {
            const match = await bcrypt.compare(password, rows[0].password_hash);
            console.log(`Password Match: ${match}`);

            if (match) {
                req.session.adminId = rows[0].id;
                req.session.username = rows[0].username;
                console.log('Login Successful');
                return res.redirect('/admin/dashboard');
            }
        }
        console.log('Invalid Credentials');
        res.render('admin-login', { error: 'Invalid credentials' });
    } catch (err) {
        console.error(err);
        res.render('admin-login', { error: 'Server error' });
    }
});

// Admin Dashboard
app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.adminId) {
        return res.redirect('/admin/login');
    }

    try {
        const certResult = await db.query('SELECT * FROM certificates ORDER BY created_at DESC');
        const certificates = certResult.rows;

        // Fetch Pending Applications
        const pendingResult = await db.query(`
            SELECT a.*, 
                   s.full_name, s.email, s.mobile_no, 
                   s.gender, s.college_name, s.degree, s.department
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.status = 'PENDING' 
            ORDER BY a.applied_at DESC
        `);
        const pendingApps = pendingResult.rows;

        // Fetch Ongoing Internships
        const ongoingResult = await db.query(`
            SELECT a.*, s.full_name, s.email, s.mobile_no 
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.status = 'ONGOING' 
            ORDER BY a.start_date DESC, a.applied_at DESC
        `);
        const ongoingApps = ongoingResult.rows;

        // Fetch All Students (Intern Details)
        const studentsResult = await db.query(`
            SELECT s.*, 
                   COALESCE(a.status, 'Not Applied') as application_status,
                   a.domain,
                   a.intern_id,
                   a.start_date,
                   a.completion_date
            FROM students s
            LEFT JOIN applications a ON s.id = a.student_id
            ORDER BY s.created_at DESC
        `);
        const allStudents = studentsResult.rows;

        res.render('admin-dashboard', {
            admin: req.session.username,
            certificates: certificates,
            pendingApplications: pendingApps,
            ongoingApplications: ongoingApps,
            allStudents: allStudents,
            success: req.query.success
        });
    } catch (err) {
        console.error(err);
        res.render('admin-dashboard', {
            admin: req.session.username,
            certificates: [],
            pendingApplications: [],
            ongoingApplications: [],
            allStudents: [],
            error: 'Failed to load dashboard data'
        });
    }
});

// Add Certificate Handler
app.post('/admin/add-certificate', upload.single('certificate_file'), async (req, res) => {
    if (!req.session.adminId) return res.redirect('/admin/login');

    const { student_name, intern_id, domain, duration } = req.body;
    let certificate_file_path = null;

    try {
        if (req.file) {
            certificate_file_path = await uploadToStorage(
                req.file.buffer,
                req.file.originalname,
                'certificates'
            );
        }

        // Generate QR Code that points to verification URL
        const verificationUrl = `${req.protocol}://${req.get('host')}/verify?intern_id=${intern_id}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

        await db.query(
            'INSERT INTO certificates (student_name, intern_id, domain, duration, certificate_file_path, qr_code_path) VALUES ($1, $2, $3, $4, $5, $6)',
            [student_name, intern_id, domain, duration, certificate_file_path, qrCodeDataUrl]
        );

        res.redirect('/admin/dashboard?success=true');
    } catch (err) {
        console.error(err);
        res.send('Error uploading certificate: ' + err.message);
    }
});

// Approve Application Handler (Generate Offer Letter)
app.post('/admin/approve/:id', upload.single('offer_letter'), async (req, res) => {
    if (!req.session.adminId) return res.redirect('/admin/login');

    const applicationId = req.params.id;

    try {
        let offer_letter_path = null;
        if (req.file) {
            offer_letter_path = await uploadToStorage(
                req.file.buffer,
                req.file.originalname,
                'offer-letters'
            );
        }

        // 1. Fetch Application & Student Details
        const appResult = await db.query(`
            SELECT a.*, s.mobile_no 
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.id = $1
        `, [applicationId]);
        const apps = appResult.rows;

        if (apps.length === 0) return res.send('Application not found');
        const appData = apps[0];

        // 2. Generate Intern ID (LOGX-LAST4MOBILE-YEAR)
        const year = new Date().getFullYear();
        const last4 = appData.mobile_no.slice(-4);
        const intern_id = `LOGX-${last4}-${year}`;

        // 3. Update Status to ONGOING, save Offer Letter, and set Start Date
        await db.query(
            `UPDATE applications SET status = 'ONGOING', intern_id = $1, offer_letter_path = $2, start_date = CURRENT_DATE WHERE id = $3`,
            [intern_id, offer_letter_path, applicationId]
        );

        res.redirect('/admin/dashboard?success=true');

    } catch (err) {
        console.error(err);
        res.send('Error approving application: ' + err.message);
    }
});

// Complete Internship Handler (Issue Certificate)
app.post('/admin/complete/:id', upload.single('certificate_file'), async (req, res) => {
    if (!req.session.adminId) return res.redirect('/admin/login');

    const applicationId = req.params.id;

    try {
        let certificate_file_path = null;
        if (req.file) {
            certificate_file_path = await uploadToStorage(
                req.file.buffer,
                req.file.originalname,
                'certificates'
            );
        }

        // 1. Fetch Application & Student Details
        const appResult = await db.query(`
            SELECT a.*, s.full_name 
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.id = $1
        `, [applicationId]);
        const apps = appResult.rows;

        if (apps.length === 0) return res.send('Application not found');
        const appData = apps[0];

        // 2. Generate QR Code for Public Verification
        const verificationUrl = `${req.protocol}://${req.get('host')}/verify?intern_id=${appData.intern_id}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

        // 3. Insert into Certificates Table (Public Record)
        await db.query(
            'INSERT INTO certificates (student_name, intern_id, domain, duration, certificate_file_path, qr_code_path) VALUES ($1, $2, $3, $4, $5, $6)',
            [appData.full_name, appData.intern_id, appData.domain, 'Internship', certificate_file_path, qrCodeDataUrl]
        );

        // 4. Update Application Status to COMPLETED and set Completion Date
        await db.query(
            `UPDATE applications SET status = 'COMPLETED', certificate_path = $1, completion_date = CURRENT_DATE WHERE id = $2`,
            [certificate_file_path, applicationId]
        );

        res.redirect('/admin/dashboard?success=true');

    } catch (err) {
        console.error(err);
        res.send('Error completing internship: ' + err.message);
    }
});

// ==========================================
// STUDENT PORTAL ROUTES
// ==========================================

// Student Login Page
app.get('/portal/login', (req, res) => {
    if (req.session.studentId) return res.redirect('/portal/dashboard');
    res.render('student-portal/login', { error: null });
});

// Student Application Page
app.get('/portal/apply', (req, res) => {
    if (req.session.studentId) return res.redirect('/portal/dashboard');
    res.render('student-portal/register', { error: null });
});

// Handle Application Submit (Register + Apply)
app.post('/portal/apply', async (req, res) => {
    const { full_name, email, mobile_no, gender, college_name, degree, department, domain, password } = req.body;

    try {
        // Check if student exists
        const existingResult = await db.query(
            'SELECT * FROM students WHERE email = $1 OR mobile_no = $2',
            [email, mobile_no]
        );
        if (existingResult.rows.length > 0) {
            return res.render('student-portal/login', { error: 'Account already exists. Please login.' });
        }

        // Hash Password
        const password_hash = await bcrypt.hash(password, 10);

        // 1. Create Student Account (RETURNING id for PostgreSQL)
        const studentResult = await db.query(
            'INSERT INTO students (full_name, email, mobile_no, gender, college_name, degree, department, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [full_name, email, mobile_no, gender, college_name, degree, department, password_hash]
        );
        const studentId = studentResult.rows[0].id;

        // 2. Create Application
        await db.query(
            `INSERT INTO applications (student_id, domain, status) VALUES ($1, $2, 'PENDING')`,
            [studentId, domain]
        );

        // Auto Login
        req.session.studentId = studentId;
        req.session.studentName = full_name;
        res.redirect('/portal/dashboard');

    } catch (err) {
        console.error(err);
        res.render('student-portal/register', { error: 'Error processing application.' });
    }
});

// Handle Student Login
app.post('/portal/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM students WHERE email = $1', [email]);
        const rows = result.rows;
        if (rows.length > 0) {
            const match = await bcrypt.compare(password, rows[0].password_hash);
            if (match) {
                req.session.studentId = rows[0].id;
                req.session.studentName = rows[0].full_name;
                return res.redirect('/portal/dashboard');
            }
        }
        res.render('student-portal/login', { error: 'Invalid email or password' });
    } catch (err) {
        console.error(err);
        res.render('student-portal/login', { error: 'Server error' });
    }
});

// Student Dashboard
app.get('/portal/dashboard', async (req, res) => {
    if (!req.session.studentId) return res.redirect('/portal/login');

    try {
        // Fetch Student Details
        const studentResult = await db.query('SELECT * FROM students WHERE id = $1', [req.session.studentId]);

        // Fetch Application Status
        const appResult = await db.query(
            'SELECT * FROM applications WHERE student_id = $1 ORDER BY applied_at DESC LIMIT 1',
            [req.session.studentId]
        );

        res.render('student-portal/dashboard', {
            student: studentResult.rows[0],
            application: appResult.rows.length > 0 ? appResult.rows[0] : null
        });
    } catch (err) {
        console.error(err);
        res.redirect('/portal/login');
    }
});

// Student Logout
app.get('/portal/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


// Student Verification Page
app.get('/verify', async (req, res) => {
    const { intern_id } = req.query;
    if (!intern_id) {
        return res.render('verification', { certificate: null, error: null });
    }

    try {
        const result = await db.query('SELECT * FROM certificates WHERE intern_id = $1', [intern_id]);
        if (result.rows.length > 0) {
            res.render('verification', { certificate: result.rows[0], error: null });
        } else {
            res.render('verification', { certificate: null, error: 'Certificate not found for ID: ' + intern_id });
        }
    } catch (err) {
        console.error(err);
        res.render('verification', { certificate: null, error: 'Server error' });
    }
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Export the app for Firebase Functions
module.exports = app;

// Start Server (Only when running locally, not in Firebase Functions)
if (process.env.NODE_ENV !== 'production' && !process.env.FIREBASE_CONFIG) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);

        // Test Database Connection
        db.query('SELECT 1')
            .then(() => console.log('✅ PostgreSQL Connection Successful!'))
            .catch(err => console.error('❌ PostgreSQL Connection Failed:', err.message));
    });
}
