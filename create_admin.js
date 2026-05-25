require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("./database");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node create_admin.js <username> <password>");
  process.exit(1);
}

const [username, password] = args;

(async () => {
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash", [username, hash]);
    console.log("Admin created/updated:", username);
    process.exit(0);
  } catch (err) {
    console.error("Error creating admin:", err);
    process.exit(1);
  }
})();
