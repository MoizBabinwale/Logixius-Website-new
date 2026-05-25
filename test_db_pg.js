require("dotenv").config();
const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME
    ? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`
    : null);

if (!connectionString) {
  console.error("No DATABASE_URL or DB_* env vars set");
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const res = await pool.query("SELECT NOW() AS now");
    console.log("Postgres connected OK, server time:", res.rows[0]);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("Postgres connection test failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
