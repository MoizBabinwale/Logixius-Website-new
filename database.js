const { Pool } = require("pg");
require("dotenv").config();

// Prefer DATABASE_URL (Neon provides this). Fallback to individual vars.
let connectionString = process.env.DATABASE_URL || null;

if (!connectionString && process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
  connectionString = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;
}

if (!connectionString) {
  console.error("Postgres connection string not provided. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  // Neon requires SSL. If Neon provides a certificate, configure appropriately.
  ssl: { rejectUnauthorized: false },
});

module.exports = {
  // Keep the API shape similar to mysql2's pool.promise().query which resolves to [rows, fields]
  query: (text, params) => {
    return pool.query(text, params).then((res) => [res.rows, res]);
  },
  pool,
};
