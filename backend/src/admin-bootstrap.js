import { randomUUID } from "node:crypto";
import argon2 from "argon2";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Seed or recover the configured administrator during startup.
 * This is useful on hosts where the service filesystem has no interactive shell.
 * The configured account is only changed if it is the active admin, or when no
 * other active admin exists. A one-time audit record prevents password resets
 * on every restart while the SQLite database is preserved.
 */
export async function bootstrapAdminFromEnvironment(database, env = process.env) {
  const fullName = (env.ADMIN_FULL_NAME || "").trim().replace(/\s+/g, " ");
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || "";
  const configured = Boolean(fullName || email || password);

  if (!configured) return { status: "not_configured" };
  if (!fullName || fullName.length > 100 || !EMAIL_PATTERN.test(email) || email.length > 254 || Array.from(password).length < 12 || Array.from(password).length > 128) {
    return { status: "invalid_configuration" };
  }

  database.exec("BEGIN IMMEDIATE;");
  try {
    const user = database.prepare("SELECT id, role, status FROM users WHERE email = ?").get(email);
    const activeAdmin = database.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1").get();

    if (user?.role === "admin" && user.status === "active") {
      const alreadyBootstrapped = database.prepare(
        "SELECT 1 FROM admin_audit_logs WHERE action = 'environment_admin_bootstrap' AND target_id = ? LIMIT 1",
      ).get(user.id);
      if (alreadyBootstrapped) {
        database.exec("COMMIT;");
        return { status: "already_configured" };
      }

      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      database.prepare("UPDATE users SET full_name = ?, password_hash = ? WHERE id = ?").run(fullName, passwordHash, user.id);
      database.prepare(`INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, reason, details)
        VALUES (?, ?, 'environment_admin_bootstrap', 'user', ?, 'Configured administrator credentials', '{}')`)
        .run(randomUUID(), user.id, user.id);
      database.exec("COMMIT;");
      return { status: "credentials_configured" };
    }

    if (activeAdmin) {
      database.exec("COMMIT;");
      return { status: "another_admin_exists" };
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const userId = user?.id || randomUUID();
    if (user) {
      database.prepare(`UPDATE users SET full_name = ?, password_hash = ?, role = 'admin', status = 'active',
        suspended_at = NULL, suspension_reason = NULL, removed_at = NULL, removal_reason = NULL WHERE id = ?`)
        .run(fullName, passwordHash, userId);
    } else {
      database.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
        .run(userId, fullName, email, passwordHash);
    }
    database.prepare(`INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, reason, details)
      VALUES (?, ?, 'environment_admin_bootstrap', 'user', ?, 'Configured first administrator account', '{}')`)
      .run(randomUUID(), userId, userId);
    database.exec("COMMIT;");
    return { status: user ? "promoted_to_admin" : "created" };
  } catch (error) {
    try { database.exec("ROLLBACK;"); } catch { /* transaction already rolled back */ }
    throw error;
  }
}
