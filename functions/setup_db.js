/**
 * Run this script ONCE to create all tables in your PostgreSQL database.
 * Usage: node setup_db.js
 * 
 * Make sure your .env file has the correct PostgreSQL connection settings.
 */
require('dotenv').config();
const { Pool } = require('pg');

async function setupDatabase() {
    let pool;
    try {
        console.log('🔄 Connecting to PostgreSQL...');
        console.log(`   Host: ${process.env.PGHOST || 'from DATABASE_URL'}`);
        console.log(`   Port: ${process.env.PGPORT || '5432'}`);
        console.log(`   Database: ${process.env.PGDATABASE || 'from DATABASE_URL'}`);

        pool = new Pool({
            connectionString: process.env.DATABASE_URL || undefined,
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || '5432', 10),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            ssl: process.env.DATABASE_URL || process.env.PGHOST !== 'localhost'
                ? { rejectUnauthorized: false }
                : false,
        });

        // Test connection
        await pool.query('SELECT 1');
        console.log('✅ Connected to PostgreSQL!\n');

        // Create Session Store Table
        console.log('📦 Creating user_sessions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "user_sessions" (
                "sid" VARCHAR NOT NULL COLLATE "default",
                "sess" JSON NOT NULL,
                "expire" TIMESTAMP(6) NOT NULL,
                PRIMARY KEY ("sid")
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire")`);
        console.log('   ✅ user_sessions table created.');

        // Create Admins Table
        console.log('📦 Creating admins table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ admins table created.');

        // Create Certificates Table
        console.log('📦 Creating certificates table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS certificates (
                id SERIAL PRIMARY KEY,
                intern_id VARCHAR(50) NOT NULL UNIQUE,
                student_name VARCHAR(100) NOT NULL,
                domain VARCHAR(100) NOT NULL,
                start_date DATE,
                end_date DATE,
                duration VARCHAR(50),
                issue_date DATE DEFAULT CURRENT_DATE,
                qr_code_path TEXT,
                certificate_file_path VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ certificates table created.');

        // Create Students Table
        console.log('📦 Creating students table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                mobile_no VARCHAR(15) NOT NULL UNIQUE,
                gender VARCHAR(10),
                college_name VARCHAR(150),
                degree VARCHAR(100),
                department VARCHAR(100),
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ students table created.');

        // Create Applications Table
        console.log('📦 Creating applications table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS applications (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL,
                domain VARCHAR(100) NOT NULL,
                status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ONGOING', 'COMPLETED', 'REJECTED')),
                intern_id VARCHAR(50),
                offer_letter_path VARCHAR(255),
                certificate_path VARCHAR(255),
                start_date DATE,
                completion_date DATE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            )
        `);
        console.log('   ✅ applications table created.');

        // Insert Default Admin
        const bcrypt = require('bcrypt');
        const adminPassword = 'admin123';
        const hash = await bcrypt.hash(adminPassword, 10);

        console.log('\n👤 Creating default admin user...');
        await pool.query(`
            INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING
        `, ['admin', hash]);
        console.log('   ✅ Default admin created (username: admin, password: admin123)');

        console.log('\n🎉 Database setup complete! All tables are ready.');
        console.log('   You can now start your server with: npm start');

    } catch (err) {
        console.error('\n❌ Error:', err.message);
    } finally {
        if (pool) await pool.end();
    }
}

setupDatabase();
