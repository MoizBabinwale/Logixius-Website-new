require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/"))); // Serve static files from root
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  }),
);

const bcrypt = require("bcrypt");
const multer = require("multer");
const QRCode = require("qrcode");
const fs = require("fs");
const { put } = require("@vercel/blob");

// Configure Multer for file uploads using memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Routes

// Gallery Page
// Gallery Page
app.get("/gallery", async (req, res) => {
  const galleryBase = "assets/project and work";
  const galleryDir = path.join(__dirname, galleryBase);

  // Structure: { 'Category Name': [ { src: '...', category: '...' }, ... ], ... }
  let groupedImages = {};

  try {
    const items = await fs.promises.readdir(galleryDir, { withFileTypes: true });

    // 1. Process Subdirectories (Categories)
    for (const item of items) {
      if (item.isDirectory()) {
        const category = item.name;
        const subDir = path.join(galleryDir, category);
        try {
          const files = await fs.promises.readdir(subDir);
          const images = files
            .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
            .map((f) => ({
              src: `${category}/${f}`,
              category: category,
            }));

          if (images.length > 0) {
            groupedImages[category] = images;
          }
        } catch (e) {
          console.error(`Error reading subdir ${category}:`, e);
        }
      } else if (item.isFile() && /\.(jpg|jpeg|png|webp|gif)$/i.test(item.name)) {
        // 2. Process Root Files (Uncategorized)
        if (!groupedImages["Other Highlights"]) {
          groupedImages["Other Highlights"] = [];
        }
        groupedImages["Other Highlights"].push({
          src: item.name,
          category: "Other Highlights",
        });
      }
    }

    res.locals.galleryGroups = groupedImages;
    res.render("gallery");
  } catch (err) {
    console.error("Error scanning gallery directory: " + err);
    res.status(500).send("Server Error: " + err.stack);
  }
});

// Main static page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Workshops Route
app.get("/workshops", (req, res) => {
  res.render("workshops");
});

// Expert Sessions Route
app.get("/expert-sessions", (req, res) => {
  res.render("expert-sessions");
});

// Industrial Projects Route
app.get("/industrial-projects", (req, res) => {
  res.render("industrial-projects");
});

// Corporate Training Route
app.get("/corporate-training", (req, res) => {
  res.render("corporate-training");
});

// Admin Login Page
app.get("/admin/login", (req, res) => {
  res.render("admin-login", { error: null });
});

// Admin Login Handler
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  console.log(`Login Attempt: ${username}`); // DEBUG LOG
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE username = $1", [username]);
    console.log("DB Search Result:", rows); // DEBUG LOG

    if (rows.length > 0) {
      const match = await bcrypt.compare(password, rows[0].password_hash);
      console.log(`Password Match: ${match}`); // DEBUG LOG

      if (match) {
        req.session.adminId = rows[0].id;
        req.session.username = rows[0].username;
        console.log("Login Successful"); // DEBUG LOG
        return res.redirect("/admin/dashboard");
      }
    }
    console.log("Invalid Credentials"); // DEBUG LOG
    res.render("admin-login", { error: "Invalid credentials" });
  } catch (err) {
    console.error(err);
    res.render("admin-login", { error: "Server error" });
  }
});

// Admin Dashboard
app.get("/admin/dashboard", async (req, res) => {
  if (!req.session.adminId) {
    return res.redirect("/admin/login");
  }

  try {
    const [certificates] = await db.query("SELECT * FROM certificates ORDER BY created_at DESC");

    // Fetch Pending Applications
    const [pendingApps] = await db.query(`
            SELECT a.*, 
                   s.full_name, s.email, s.mobile_no, 
                   s.gender, s.college_name, s.degree, s.department
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.status = 'PENDING' 
            ORDER BY a.applied_at DESC
        `);

    // Fetch Ongoing Internships
    const [ongoingApps] = await db.query(`
            SELECT a.*, s.full_name, s.email, s.mobile_no 
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.status = 'ONGOING' 
            ORDER BY a.start_date DESC, a.applied_at DESC
        `);

    // Fetch All Students (Intern Details)
    const [allStudents] = await db.query(`
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

    res.render("admin-dashboard", {
      admin: req.session.username,
      certificates: certificates,
      pendingApplications: pendingApps,
      ongoingApplications: ongoingApps,
      allStudents: allStudents,
      success: req.query.success,
    });
  } catch (err) {
    console.error(err);
    res.render("admin-dashboard", {
      admin: req.session.username,
      certificates: [],
      pendingApplications: [],
      ongoingApplications: [],
      allStudents: [],
      error: "Failed to load dashboard data",
    });
  }
});

// Add Certificate Handler
app.post("/admin/add-certificate", upload.single("certificate_file"), async (req, res) => {
  if (!req.session.adminId) return res.redirect("/admin/login");

  const { student_name, intern_id, domain, duration } = req.body;
  let certificate_file_path = null;

  try {
    if (req.file) {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      certificate_file_path = blob.url;
    }

    // Generate QR Code that points to verification URL
    const verificationUrl = `${req.protocol}://${req.get("host")}/verify?intern_id=${intern_id}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

    await db.query("INSERT INTO certificates (student_name, intern_id, domain, duration, certificate_file_path, qr_code_path) VALUES ($1, $2, $3, $4, $5, $6)", [
      student_name,
      intern_id,
      domain,
      duration,
      certificate_file_path,
      qrCodeDataUrl,
    ]);

    res.redirect("/admin/dashboard?success=true");
  } catch (err) {
    console.error(err);
    res.send("Error uploading certificate: " + err.message);
  }
});

// Approve Application Handler (Generate Offer Letter)
app.post("/admin/approve/:id", upload.single("offer_letter"), async (req, res) => {
  if (!req.session.adminId) return res.redirect("/admin/login");

  const applicationId = req.params.id;

  try {
    let offer_letter_path = null;
    if (req.file) {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      offer_letter_path = blob.url;
    }

    // 1. Fetch Application & Student Details
    const [apps] = await db.query(
      `
            SELECT a.*, s.mobile_no 
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.id = $1
        `,
      [applicationId],
    );

    if (apps.length === 0) return res.send("Application not found");
    const appData = apps[0];

    // 2. Generate Intern ID (LOGX-LAST4MOBILE-YEAR)
    const year = new Date().getFullYear();
    const last4 = appData.mobile_no.slice(-4);
    const intern_id = `LOGX-${last4}-${year}`;

    // 3. Update Status to ONGOING, save Offer Letter, and set Start Date
    await db.query("UPDATE applications SET status = 'ONGOING', intern_id = $1, offer_letter_path = $2, start_date = CURRENT_DATE WHERE id = $3", [intern_id, offer_letter_path, applicationId]);

    res.redirect("/admin/dashboard?success=true");
  } catch (err) {
    console.error(err);
    res.send("Error approving application: " + err.message);
  }
});

// Complete Internship Handler (Issue Certificate)
app.post("/admin/complete/:id", upload.single("certificate_file"), async (req, res) => {
  if (!req.session.adminId) return res.redirect("/admin/login");

  const applicationId = req.params.id;

  try {
    let certificate_file_path = null;
    if (req.file) {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      certificate_file_path = blob.url;
    }

    // 1. Fetch Application & Student Details
    const [apps] = await db.query(
      `
            SELECT a.*, s.full_name 
            FROM applications a 
            JOIN students s ON a.student_id = s.id 
            WHERE a.id = $1
        `,
      [applicationId],
    );

    if (apps.length === 0) return res.send("Application not found");
    const appData = apps[0];

    // 2. Generate QR Code for Public Verification
    const verificationUrl = `${req.protocol}://${req.get("host")}/verify?intern_id=${appData.intern_id}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

    // 3. Insert into Certificates Table (Public Record)
    await db.query("INSERT INTO certificates (student_name, intern_id, domain, duration, certificate_file_path, qr_code_path) VALUES ($1, $2, $3, $4, $5, $6)", [
      appData.full_name,
      appData.intern_id,
      appData.domain,
      "Internship",
      certificate_file_path,
      qrCodeDataUrl,
    ]);

    // 4. Update Application Status to COMPLETED and set Completion Date
    await db.query("UPDATE applications SET status = 'COMPLETED', certificate_path = $1, completion_date = CURRENT_DATE WHERE id = $2", [certificate_file_path, applicationId]);

    res.redirect("/admin/dashboard?success=true");
  } catch (err) {
    console.error(err);
    res.send("Error completing internship: " + err.message);
  }
});

// ==========================================
// STUDENT PORTAL ROUTES
// ==========================================

// Student Login Page
app.get("/portal/login", (req, res) => {
  if (req.session.studentId) return res.redirect("/portal/dashboard");
  res.render("student-portal/login", { error: null });
});

// Student Application Page
app.get("/portal/apply", (req, res) => {
  if (req.session.studentId) return res.redirect("/portal/dashboard");
  res.render("student-portal/register", { error: null });
});

// Handle Application Submit (Register + Apply)
app.post("/portal/apply", async (req, res) => {
  const { full_name, email, mobile_no, gender, college_name, degree, department, domain, password } = req.body;

  try {
    // Check if student exists
    const [existing] = await db.query("SELECT * FROM students WHERE email = $1 OR mobile_no = $2", [email, mobile_no]);
    if (existing.length > 0) {
      return res.render("student-portal/login", { error: "Account already exists. Please login." });
    }

    // Hash Password
    const password_hash = await bcrypt.hash(password, 10);

    // 1. Create Student Account
    const [studentRows] = await db.query(
      "INSERT INTO students (full_name, email, mobile_no, gender, college_name, degree, department, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [full_name, email, mobile_no, gender, college_name, degree, department, password_hash],
    );
    const studentId = studentRows[0].id;

    // 2. Create Application
    await db.query("INSERT INTO applications (student_id, domain, status) VALUES ($1, $2, 'PENDING')", [studentId, domain]);

    // Auto Login
    req.session.studentId = studentId;
    req.session.studentName = full_name;
    res.redirect("/portal/dashboard");
  } catch (err) {
    console.error(err);
    res.render("student-portal/register", { error: "Error processing application." });
  }
});

// Handle Student Login
app.post("/portal/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Portal login attempt:", email);
  try {
    const [rows] = await db.query("SELECT * FROM students WHERE email = $1", [email]);
    console.log("Portal login DB rows length:", rows.length);
    if (rows.length > 0) {
      console.log("Has password_hash:", !!rows[0].password_hash);
      const match = await bcrypt.compare(password, rows[0].password_hash);
      console.log("Password compare result:", match);
      if (match) {
        req.session.studentId = rows[0].id;
        req.session.studentName = rows[0].full_name;
        return res.redirect("/portal/dashboard");
      }
    }
    res.render("student-portal/login", { error: "Invalid email or password" });
  } catch (err) {
    console.error("Portal login error:", err);
    res.render("student-portal/login", { error: "Server error" });
  }
});

// Student Dashboard
app.get("/portal/dashboard", async (req, res) => {
  if (!req.session.studentId) return res.redirect("/portal/login");

  try {
    // Fetch Student Details
    const [students] = await db.query("SELECT * FROM students WHERE id = $1", [req.session.studentId]);

    // Fetch Application Status
    const [applications] = await db.query("SELECT * FROM applications WHERE student_id = $1 ORDER BY applied_at DESC LIMIT 1", [req.session.studentId]);

    res.render("student-portal/dashboard", {
      student: students[0],
      application: applications.length > 0 ? applications[0] : null,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/portal/login");
  }
});

// Student Logout
app.get("/portal/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Student Verification Page
app.get("/verify", async (req, res) => {
  const { intern_id } = req.query;
  if (!intern_id) {
    return res.render("verification", { certificate: null, error: null });
  }

  try {
    const [rows] = await db.query("SELECT * FROM certificates WHERE intern_id = $1", [intern_id]);
    if (rows.length > 0) {
      res.render("verification", { certificate: rows[0], error: null });
    } else {
      res.render("verification", { certificate: null, error: "Certificate not found for ID: " + intern_id });
    }
  } catch (err) {
    console.error(err);
    res.render("verification", { certificate: null, error: "Server error" });
  }
});

// Admin Logout
app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin/login");
});

// Export the app for Vercel
module.exports = app;

// Start Server (Only when not running on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);

    // Test Database Connection
    db.query("SELECT 1")
      .then(() => console.log("✅ Database Connection Successful!"))
      .catch((err) => console.error("❌ Database Connection Failed:", err.message));
  });
}
