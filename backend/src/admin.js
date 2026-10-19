import { randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth, requireRole } from "./auth.js";

const REPORT_STATES = new Set(["pending", "under_review", "resolved", "dismissed"]);
const USER_STATES = new Set(["active", "suspended", "removed"]);
const ROLES = new Set(["user", "admin"]);
const text = (value, max) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const pageArgs = (query) => {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 && Number.isInteger(offset) && offset >= 0 && offset <= 100000
    ? { limit, offset } : null;
};

function audit(database, adminId, action, targetType, targetId, reason = "", details = {}) {
  database.prepare(`INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, reason, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), adminId, action, targetType, targetId, reason, JSON.stringify(details));
}

function transaction(database, callback) {
  database.exec("BEGIN IMMEDIATE;");
  try { const result = callback(); database.exec("COMMIT;"); return result; }
  catch (error) { database.exec("ROLLBACK;"); throw error; }
}

function adminLimiter() {
  return rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: "Too many moderation actions. Please try again shortly." }) });
}

export function createModerationRouter(database) {
  const router = Router();
  router.use(requireAuth(database));
  const mutateLimit = adminLimiter();

  router.post("/reports", mutateLimit, (req, res) => {
    const targetType = req.body?.targetType;
    const targetId = text(req.body?.targetId, 100);
    const reason = text(req.body?.reason, 1000);
    if (!['profile', 'message'].includes(targetType) || !targetId || reason.length < 10) {
      return res.status(400).json({ error: "Choose a supported target and provide a reason of at least 10 characters." });
    }
    if (targetType === "profile") {
      if (targetId === req.user.id) return res.status(400).json({ error: "You cannot report your own profile." });
      const target = database.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active'").get(targetId);
      if (!target) return res.status(404).json({ error: "Report target not found." });
    } else {
      const visible = database.prepare(`SELECT 1 FROM messages m JOIN conversation_members cm
        ON cm.conversation_id = m.conversation_id AND cm.user_id = ? AND cm.left_at IS NULL WHERE m.id = ?`).get(req.user.id, targetId);
      if (!visible) return res.status(404).json({ error: "Report target not found." });
    }
    const id = randomUUID();
    database.prepare("INSERT INTO reports (id, reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)")
      .run(id, req.user.id, targetType, targetId, reason);
    return res.status(201).json({ report: { id, status: "pending", createdAt: database.prepare("SELECT created_at FROM reports WHERE id = ?").get(id).created_at } });
  });

  router.get("/reports/mine", (req, res) => {
    const reports = database.prepare("SELECT id, target_type, status, created_at, updated_at FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 50").all(req.user.id);
    return res.json({ reports });
  });

  const admin = Router();
  admin.use(requireRole("admin"));
  admin.get("/auth-check", (_req, res) => res.json({ status: "ok" }));

  admin.get("/overview", (_req, res) => {
    const counts = (sql) => database.prepare(sql).get().count;
    const users = {
      total: counts("SELECT COUNT(*) count FROM users"),
      active: counts("SELECT COUNT(*) count FROM users WHERE status = 'active'"),
      suspended: counts("SELECT COUNT(*) count FROM users WHERE status = 'suspended'"),
      removed: counts("SELECT COUNT(*) count FROM users WHERE status = 'removed'"),
    };
    const requests = {
      pending: counts("SELECT COUNT(*) count FROM exchange_requests WHERE status = 'pending'"),
      accepted: counts("SELECT COUNT(*) count FROM exchange_requests WHERE status = 'accepted'"),
      rejected: counts("SELECT COUNT(*) count FROM exchange_requests WHERE status = 'rejected'"),
    };
    const sessions = {
      upcoming: counts("SELECT COUNT(*) count FROM learning_sessions WHERE cancelled_at IS NULL AND status = 'scheduled' AND (scheduled_at IS NULL OR scheduled_at > CURRENT_TIMESTAMP)"),
      completed: counts("SELECT COUNT(*) count FROM learning_sessions WHERE status = 'completed'"),
      cancelled: counts("SELECT COUNT(*) count FROM learning_sessions WHERE cancelled_at IS NOT NULL"),
    };
    const reports = { pending: counts("SELECT COUNT(*) count FROM reports WHERE status = 'pending'") };
    const recentActions = database.prepare(`SELECT l.id, l.action, l.target_type, l.target_id, l.reason, l.created_at,
      COALESCE(u.full_name, 'Former administrator') AS admin_name FROM admin_audit_logs l
      LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.created_at DESC, l.id DESC LIMIT 8`).all();
    res.json({ users, requests, sessions, reports, recentActions });
  });

  admin.get("/users", (req, res) => {
    const paging = pageArgs(req.query); const q = req.query.q === undefined ? "" : text(req.query.q, 100);
    const status = req.query.status === undefined ? "" : req.query.status;
    const role = req.query.role === undefined ? "" : req.query.role;
    if (!paging || (status && !USER_STATES.has(status)) || (role && !ROLES.has(role)) || typeof req.query.q === "object") {
      return res.status(400).json({ error: "Invalid user search filters or pagination." });
    }
    const where = []; const args = [];
    if (q) { where.push("(u.full_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`; args.push(like, like); }
    if (status) { where.push("u.status = ?"); args.push(status); }
    if (role) { where.push("u.role = ?"); args.push(role); }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = database.prepare(`SELECT COUNT(*) count FROM users u${clause}`).get(...args).count;
    const users = database.prepare(`SELECT u.id, u.full_name AS fullName, u.email, u.role, u.status, u.created_at AS createdAt, u.last_active_at AS lastActiveAt,
      u.suspended_at AS suspendedAt, u.suspension_reason AS suspensionReason, u.removed_at AS removedAt, u.removal_reason AS removalReason
      FROM users u${clause} ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`).all(...args, paging.limit, paging.offset);
    res.json({ users, total, ...paging });
  });

  admin.get("/users/:id", (req, res) => {
    const user = database.prepare(`SELECT id, full_name AS fullName, email, role, status, created_at AS createdAt, last_active_at AS lastActiveAt,
      suspended_at AS suspendedAt, suspension_reason AS suspensionReason, removed_at AS removedAt, removal_reason AS removalReason
      FROM users WHERE id = ?`).get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const activity = {
      teachSkills: database.prepare("SELECT COUNT(*) count FROM skills WHERE user_id = ? AND kind = 'teach'").get(user.id).count,
      learningGoals: database.prepare("SELECT COUNT(*) count FROM skills WHERE user_id = ? AND kind = 'learn'").get(user.id).count,
      exchangeRequests: database.prepare("SELECT COUNT(*) count FROM exchange_requests WHERE sender_user_id = ? OR recipient_user_id = ?").get(user.id, user.id).count,
      sessions: database.prepare("SELECT COUNT(*) count FROM learning_session_participants WHERE user_id = ?").get(user.id).count,
      lastActiveAt: user.lastActiveAt,
    };
    const roadmaps = database.prepare(`SELECT goal, plan_json AS planJson, completed_json AS completedJson,
      created_at AS createdAt, updated_at AS updatedAt FROM career_roadmaps WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`).all(user.id).map((row) => {
      let plan = {}; let completed = [];
      try { plan = JSON.parse(row.planJson); } catch { /* Ignore malformed historical data. */ }
      try { completed = JSON.parse(row.completedJson); } catch { /* Ignore malformed historical data. */ }
      const totalTasks = Array.isArray(plan.phases) ? plan.phases.reduce((sum, phase) => sum + (Array.isArray(phase.sessions) ? phase.sessions.length : 0), 0) : 0;
      return { goal: row.goal, roleSummary: text(plan.roleSummary, 1200), totalTasks, completedTasks: Array.isArray(completed) ? completed.filter((index) => Number.isInteger(index) && index >= 0 && index < totalTasks).length : 0, createdAt: row.createdAt, updatedAt: row.updatedAt };
    });
    const skills = database.prepare(`SELECT id, kind, name, category, experience_level AS experienceLevel,
      instruction_language AS instructionLanguage, description, created_at AS createdAt, updated_at AS updatedAt
      FROM skills WHERE user_id = ? ORDER BY kind, lower(name), id`).all(user.id);
    const requests = database.prepare(`SELECT r.id, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt,
      r.sender_user_id AS senderId, r.recipient_user_id AS recipientId,
      sender.full_name AS senderName, recipient.full_name AS recipientName,
      COALESCE(k.name, 'Skill no longer available') AS skillName,
      CASE WHEN r.sender_user_id = ? THEN 'sent' ELSE 'received' END AS direction
      FROM exchange_requests r JOIN users sender ON sender.id = r.sender_user_id
      JOIN users recipient ON recipient.id = r.recipient_user_id
      LEFT JOIN skills k ON k.id = r.skill_id
      WHERE r.sender_user_id = ? OR r.recipient_user_id = ?
      ORDER BY r.created_at DESC, r.id DESC LIMIT 100`).all(user.id, user.id, user.id);
    const sessions = database.prepare(`SELECT s.id, s.skill_name AS skillName, s.title, s.status,
      s.scheduled_at AS scheduledAt, s.completed_at AS completedAt, s.cancelled_at AS cancelledAt,
      s.duration_minutes AS durationMinutes,
      CASE WHEN s.teacher_user_id = ? THEN 'teacher' ELSE 'learner' END AS role,
      CASE WHEN s.teacher_user_id = ? THEN learner.full_name ELSE teacher.full_name END AS counterpartName
      FROM learning_sessions s JOIN users teacher ON teacher.id = s.teacher_user_id
      JOIN users learner ON learner.id = s.learner_user_id
      WHERE s.teacher_user_id = ? OR s.learner_user_id = ?
      ORDER BY COALESCE(s.scheduled_at, s.created_at) DESC, s.id DESC LIMIT 100`).all(user.id, user.id, user.id, user.id);
    const openRooms = database.prepare(`SELECT r.id, r.title, r.skill_name AS skillName, r.status,
      r.starts_at AS scheduledAt, r.closed_at AS closedAt, r.duration_minutes AS durationMinutes,
      p.role, (SELECT COUNT(*) FROM open_learning_room_participants allp WHERE allp.room_id = r.id) AS participantCount
      FROM open_learning_rooms r JOIN open_learning_room_participants p ON p.room_id = r.id
      WHERE p.user_id = ? ORDER BY r.starts_at DESC, r.id DESC LIMIT 100`).all(user.id);
    res.json({ user, activity, roadmaps, skills, requests, sessions, openRooms });
  });

  admin.patch("/users/:id", mutateLimit, (req, res) => {
    const targetId = req.params.id; const action = req.body?.action;
    const reason = text(req.body?.reason, 1000);
    if (!["suspend", "reinstate", "remove", "change_role"].includes(action)) return res.status(400).json({ error: "Choose a supported account action." });
    if ((action === "suspend" || action === "remove" || action === "change_role") && reason.length < 3) return res.status(400).json({ error: "Provide a reason of at least 3 characters." });
    if (["suspend", "remove", "change_role"].includes(action) && targetId === req.user.id) return res.status(400).json({ error: "You cannot apply this action to your own account." });
    const target = database.prepare("SELECT id, role, status FROM users WHERE id = ?").get(targetId);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.status === "removed") return res.status(409).json({ error: "Removed accounts cannot be changed." });
    if (action === "suspend" && target.status !== "active") return res.status(409).json({ error: "Only active accounts can be suspended." });
    if (action === "reinstate" && target.status !== "suspended") return res.status(409).json({ error: "Only suspended accounts can be reinstated." });
    if (action === "change_role" && !ROLES.has(req.body?.role)) return res.status(400).json({ error: "Choose a valid role." });
    if (action === "change_role" && req.body.role === target.role) return res.status(400).json({ error: "The account already has that role." });
    transaction(database, () => {
      if ((action === "suspend" || action === "remove" || (action === "change_role" && req.body.role !== "admin")) && target.role === "admin" && target.status === "active") {
        const admins = database.prepare("SELECT COUNT(*) count FROM users WHERE role = 'admin' AND status = 'active'").get().count;
        if (admins <= 1) throw Object.assign(new Error("The last active admin cannot be suspended, removed, or demoted."), { status: 409 });
      }
      if (action === "suspend") database.prepare("UPDATE users SET status='suspended', suspended_at=CURRENT_TIMESTAMP, suspension_reason=? WHERE id=?").run(reason, targetId);
      if (action === "reinstate") database.prepare("UPDATE users SET status='active', suspended_at=NULL, suspension_reason=NULL WHERE id=?").run(targetId);
      if (action === "remove") database.prepare("UPDATE users SET status='removed', removed_at=CURRENT_TIMESTAMP, removal_reason=? WHERE id=?").run(reason, targetId);
      if (action === "change_role") database.prepare("UPDATE users SET role=? WHERE id=?").run(req.body.role, targetId);
      audit(database, req.user.id, action, "user", targetId, reason, action === "change_role" ? { from: target.role, to: req.body.role } : {});
    });
    const updated = database.prepare("SELECT id, full_name AS fullName, email, role, status, created_at AS createdAt, suspended_at AS suspendedAt, suspension_reason AS suspensionReason, removed_at AS removedAt, removal_reason AS removalReason FROM users WHERE id=?").get(targetId);
    res.json({ user: updated });
  });

  admin.get("/reports", (req, res) => {
    const paging = pageArgs(req.query); const status = req.query.status === undefined ? "" : req.query.status;
    if (!paging || (status && !REPORT_STATES.has(status))) return res.status(400).json({ error: "Invalid report filters or pagination." });
    const clause = status ? "WHERE r.status = ?" : ""; const args = status ? [status] : [];
    const total = database.prepare(`SELECT COUNT(*) count FROM reports r ${clause}`).get(...args).count;
    // Message body and private conversation details are intentionally omitted from moderation lists.
    const reports = database.prepare(`SELECT r.id, r.reporter_id AS reporterId, reporter.full_name AS reporterName,
      r.target_type AS targetType, r.target_id AS targetId, target.full_name AS targetName,
      r.reason, r.status, r.moderation_notes AS moderationNotes, r.created_at AS createdAt, r.updated_at AS updatedAt
      FROM reports r LEFT JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users target ON r.target_type = 'profile' AND target.id = r.target_id ${clause}
      ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`).all(...args, paging.limit, paging.offset);
    res.json({ reports, total, ...paging });
  });

  admin.get("/reports/:id", (req, res) => {
    const report = database.prepare(`SELECT r.id, r.target_type AS targetType, r.target_id AS targetId,
      r.reason, r.status, r.created_at AS createdAt, reporter.full_name AS reporterName
      FROM reports r LEFT JOIN users reporter ON reporter.id = r.reporter_id WHERE r.id = ?`).get(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found." });
    // Reveal only the specific reported message needed for review, never its conversation or surrounding history.
    let reportedContent = null;
    if (report.targetType === "message") {
      const message = database.prepare(`SELECT m.body, m.created_at AS createdAt, u.full_name AS senderName
        FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?`).get(report.targetId);
      if (message) reportedContent = { type: "message", ...message };
    } else if (report.targetType === "profile") {
      const profile = database.prepare(`SELECT u.full_name AS fullName, p.bio FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status <> 'removed'`).get(report.targetId);
      if (profile) reportedContent = { type: "profile", ...profile };
    }
    return res.json({ report, reportedContent });
  });

  admin.patch("/reports/:id", mutateLimit, (req, res) => {
    const status = req.body?.status; const notes = text(req.body?.moderationNotes ?? "", 2000);
    const reason = text(req.body?.reason ?? notes, 1000);
    if (!REPORT_STATES.has(status)) return res.status(400).json({ error: "Choose a valid report status." });
    if (notes.length < 3 || reason.length < 3) return res.status(400).json({ error: "Add a moderation note of at least 3 characters before changing report status." });
    if (!database.prepare("SELECT id, status FROM reports WHERE id = ?").get(req.params.id)) return res.status(404).json({ error: "Report not found." });
    transaction(database, () => {
      database.prepare("UPDATE reports SET status=?, moderation_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, notes, req.params.id);
      audit(database, req.user.id, "report_status_changed", "report", req.params.id, reason, { status });
    });
    const report = database.prepare("SELECT id, status, moderation_notes AS moderationNotes, updated_at AS updatedAt FROM reports WHERE id=?").get(req.params.id);
    res.json({ report });
  });

  admin.get("/audit-logs", (req, res) => {
    const paging = pageArgs(req.query); if (!paging) return res.status(400).json({ error: "Invalid pagination." });
    const total = database.prepare("SELECT COUNT(*) count FROM admin_audit_logs").get().count;
    const logs = database.prepare(`SELECT l.id, l.action, l.target_type AS targetType, l.target_id AS targetId, l.reason,
      l.details, l.created_at AS createdAt, l.admin_id AS adminId, COALESCE(u.full_name, 'Former administrator') AS adminName
      FROM admin_audit_logs l LEFT JOIN users u ON u.id=l.admin_id ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`)
      .all(paging.limit, paging.offset).map((row) => ({ ...row, details: JSON.parse(row.details || "{}") }));
    res.json({ logs, total, ...paging });
  });

  router.use("/admin", admin);
  return router;
}

export function createAdminErrorHandler() {
  return (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  };
}
