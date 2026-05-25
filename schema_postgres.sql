-- Postgres-compatible schema for Logixius application
-- Run this on your Neon/Postgres database (psql -f schema_postgres.sql)

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    domain VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    intern_id VARCHAR(50),
    offer_letter_path VARCHAR(255),
    certificate_path VARCHAR(255),
    start_date DATE,
    completion_date DATE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin if not exists (replace password hash with a real hash)
INSERT INTO admins (username, password_hash)
VALUES ('admin', '$2b$10$YourHashedPasswordHere')
ON CONFLICT (username) DO NOTHING;
