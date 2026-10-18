import "dotenv/config";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { initializeDatabase } from "../database.js";

const fullName = (process.env.ADMIN_FULL_NAME || "").trim().replace(/\s+/g, " ");
const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!fullName || fullName.length > 100 || !emailPattern.test(email) || email.length > 254 || password.length < 12 || password.length > 128) {
  console.error("Set ADMIN_FULL_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (12–128 characters) in the environment before running this command.");
  process.exit(1);
}

const database = initializeDatabase();
try {
  database.exec("BEGIN IMMEDIATE;");
  if (database.prepare("SELECT 1 FROM users WHERE role='admin' AND status='active' LIMIT 1").get()) {
    throw new Error("An active administrator already exists; refusing to bootstrap another one.");
  }
  if (database.prepare("SELECT 1 FROM users WHERE email=?").get(email)) {
    throw new Error("That email already belongs to an account. First-admin setup will not change an existing account's role.");
  }
  const id = randomUUID();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  database.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
    .run(id, fullName, email, passwordHash);
  database.prepare(`INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, reason, details)
    VALUES (?, ?, 'first_admin_created', 'user', ?, 'Protected first-admin bootstrap', '{}')`).run(randomUUID(), id, id);
  database.exec("COMMIT;");
  console.log(`Created the first administrator account for ${email}. Sign in at /login, then open /admin.`);
} catch (error) {
  try { database.exec("ROLLBACK;"); } catch { /* transaction may already have rolled back */ }
  console.error(error.message);
  process.exitCode = 1;
} finally {
  database.close();
}
