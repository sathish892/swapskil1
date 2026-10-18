import { createHmac, randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./auth.js";
import { dispatchEmailNotifications } from "./email-notifications.js";

const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
function runInTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE;");
  try {
    const result = operation();
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    try { database.exec("ROLLBACK;"); } catch { /* transaction may already be closed */ }
    throw error;
  }
}
const hasAccess = (database, sessionId, userId) => database.prepare(
  "SELECT 1 FROM learning_session_participants WHERE session_id = ? AND user_id = ?",
).get(sessionId, userId);

function scheduleFields(body, existing = null) {
  const title = typeof body?.title === "string" ? body.title.trim().replace(/\s+/g, " ") : existing?.title || "";
  const skill = typeof body?.skill === "string" ? body.skill.trim().replace(/\s+/g, " ") : existing?.skill_name || "";
  const description = typeof body?.description === "string" ? body.description.trim() : existing?.description || "";
  const scheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt : existing?.scheduled_at || "";
  const durationMinutes = body?.durationMinutes === undefined ? (existing?.duration_minutes ?? 60) : body.durationMinutes;
  const errors = {};
  if (title.length < 3 || title.length > 120) errors.title = "Use a title from 3 to 120 characters.";
  if (!skill || skill.length > 120 || normalize(skill) !== normalize(existing?.skill_name || skill)) errors.skill = "Choose the skill attached to this accepted exchange.";
  if (description.length > 2000) errors.description = "Use 2,000 characters or fewer.";
  const parsedStart = typeof scheduledAt === "string" ? Date.parse(scheduledAt) : NaN;
  const normalizedStart = Number.isFinite(parsedStart) ? new Date(parsedStart).toISOString() : "";
  const canonicalStart = typeof scheduledAt === "string" ? (scheduledAt.includes(".") ? scheduledAt : scheduledAt.replace("Z", ".000Z")) : "";
  if (typeof scheduledAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(scheduledAt) || !Number.isFinite(parsedStart) || normalizedStart !== canonicalStart) errors.scheduledAt = "Choose a valid date and time in UTC.";
  else if (parsedStart < Date.now() + 60_000) errors.scheduledAt = "Schedule the session at least one minute in the future.";
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) errors.durationMinutes = "Choose a duration from 15 to 240 minutes.";
  return { errors, values: { title, skill: existing?.skill_name || skill, description, scheduledAt, durationMinutes } };
}

function meetingStatus(row, now = Date.now()) {
  if (row.cancelled_at) return "cancelled";
  if (row.status === "completed") return "completed";
  if (!row.scheduled_at) return "unscheduled";
  const start = Date.parse(row.scheduled_at);
  if (now < start) return "upcoming";
  if (now <= start + row.duration_minutes * 60_000) return "ongoing";
  return "completed";
}

function publicSession(row, participants) {
  return {
    id: row.id, title: row.title || row.skill_name, skill: row.skill_name, description: row.description || "",
    scheduledAt: row.scheduled_at, durationMinutes: row.duration_minutes, status: row.status,
    meetingStatus: meetingStatus(row), cancelledAt: row.cancelled_at, completedAt: row.completed_at,
    createdAt: row.created_at, createdBy: row.created_by,
    participants: participants.map((p) => ({ id: p.user_id, fullName: p.full_name, role: p.role })),
  };
}

export function createLearningSessionsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));
  const participantRows = database.prepare(
    "SELECT p.user_id, p.role, u.full_name FROM learning_session_participants p JOIN users u ON u.id = p.user_id " +
    "WHERE p.session_id = ? ORDER BY CASE p.role WHEN 'teacher' THEN 0 ELSE 1 END",
  );
  const eligibleLearners = database.prepare(
    "SELECT DISTINCT u.id, u.full_name FROM exchange_requests er " +
    "JOIN skills sk ON sk.id = er.skill_id JOIN users u ON u.id = er.sender_user_id " +
    "WHERE er.recipient_user_id = ? AND er.status = 'accepted' AND sk.kind = 'teach' " +
    "AND lower(trim(sk.name)) = lower(trim(?)) AND u.status = 'active' " +
    "AND NOT EXISTS (SELECT 1 FROM learning_session_participants p WHERE p.session_id = ? AND p.user_id = u.id) " +
    "ORDER BY lower(u.full_name), u.id LIMIT 100",
  );
  const sessionSelect = "SELECT id, exchange_request_id, teacher_user_id, learner_user_id, skill_name, status, title, description, scheduled_at, duration_minutes, created_by, cancelled_at, created_at, completed_at FROM learning_sessions ";

  router.post("/learning-sessions", (req, res) => {
    const requestId = typeof req.body?.exchangeRequestId === "string" ? req.body.exchangeRequestId.trim() : "";
    if (!requestId || requestId.length > 100) return res.status(400).json({ error: "Choose an accepted exchange request." });
    const row = database.prepare(sessionSelect + "WHERE exchange_request_id = ?").get(requestId);
    if (!row || !hasAccess(database, row.id, req.user.id) || !database.prepare("SELECT 1 FROM exchange_requests WHERE id = ? AND status = 'accepted'").get(requestId)) {
      return res.status(404).json({ error: "Accepted exchange request not found." });
    }
    if (row.cancelled_at || row.status === "completed") return res.status(409).json({ error: "This learning session cannot be scheduled." });
    if (row.scheduled_at || row.created_by) return res.status(409).json({ error: "This exchange already has a scheduled learning session." });
    const { errors, values } = scheduleFields(req.body, row);
    if (Object.keys(errors).length) return res.status(400).json({ error: "Check the session details.", errors });
    database.prepare("UPDATE learning_sessions SET title = ?, description = ?, scheduled_at = ?, duration_minutes = ?, created_by = ? WHERE id = ? AND scheduled_at IS NULL AND created_by IS NULL")
      .run(values.title, values.description, values.scheduledAt, values.durationMinutes, req.user.id, row.id);
    const saved = database.prepare(sessionSelect + "WHERE id = ?").get(row.id);
    void dispatchEmailNotifications(database);
    return res.status(201).json({ session: publicSession(saved, participantRows.all(row.id)) });
  });

  router.get("/learning-sessions/:id", (req, res) => {
    const row = database.prepare(sessionSelect + "WHERE id = ?").get(req.params.id);
    if (!row || !hasAccess(database, row.id, req.user.id)) return res.status(404).json({ error: "Learning session not found." });
    return res.json({ session: publicSession(row, participantRows.all(row.id)) });
  });

  router.get("/learning-sessions/:id/eligible-learners", (req, res) => {
    const row = database.prepare(sessionSelect + "WHERE id = ?").get(req.params.id);
    if (!row || !hasAccess(database, row.id, req.user.id)) return res.status(404).json({ error: "Learning session not found." });
    if (row.teacher_user_id !== req.user.id || row.created_by !== req.user.id) return res.status(403).json({ error: "Only the teacher who created this room can invite learners." });
    const learners = eligibleLearners.all(row.teacher_user_id, row.skill_name, row.id).map((learner) => ({ id: learner.id, fullName: learner.full_name }));
    return res.json({ learners, capacity: 8, remaining: Math.max(0, 8 - participantRows.all(row.id).length) });
  });

  router.post("/learning-sessions/:id/participants", (req, res) => {
    const row = database.prepare(sessionSelect + "WHERE id = ?").get(req.params.id);
    if (!row || !hasAccess(database, row.id, req.user.id)) return res.status(404).json({ error: "Learning session not found." });
    if (row.teacher_user_id !== req.user.id || row.created_by !== req.user.id) return res.status(403).json({ error: "Only the teacher who created this room can invite learners." });
    if (row.cancelled_at || row.status === "completed") return res.status(409).json({ error: "This room is no longer available for invitations." });
    const userIds = req.body?.userIds;
    if (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > 7 || userIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 100) || new Set(userIds).size !== userIds.length) {
      return res.status(400).json({ error: "Choose between 1 and 7 different learners." });
    }
    const available = new Set(eligibleLearners.all(row.teacher_user_id, row.skill_name, row.id).map((learner) => learner.id));
    if (userIds.some((id) => !available.has(id))) return res.status(400).json({ error: "Every learner must have an accepted exchange for this skill with you." });
    const currentCount = participantRows.all(row.id).length;
    if (currentCount + userIds.length > 8) return res.status(409).json({ error: "A learning room can have up to 8 participants." });
    const addLearner = database.prepare("INSERT INTO learning_session_participants (session_id, user_id, role) VALUES (?, ?, 'learner')");
    runInTransaction(database, () => userIds.forEach((id) => addLearner.run(row.id, id)));
    return res.status(201).json({ participants: participantRows.all(row.id).map((p) => ({ id: p.user_id, fullName: p.full_name, role: p.role })) });
  });

  router.patch("/learning-sessions/:id", (req, res) => {
    const row = database.prepare(sessionSelect + "WHERE id = ?").get(req.params.id);
    if (!row || !hasAccess(database, row.id, req.user.id)) return res.status(404).json({ error: "Learning session not found." });
    if (!row.created_by || row.created_by !== req.user.id) return res.status(403).json({ error: "Only the session creator can change this session." });
    if (row.cancelled_at || row.status === "completed") return res.status(409).json({ error: "This session can no longer be changed." });
    const action = req.body?.action;
    if (action === "cancel") {
      database.prepare("UPDATE learning_sessions SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND cancelled_at IS NULL").run(row.id);
      return res.json({ session: publicSession(database.prepare(sessionSelect + "WHERE id = ?").get(row.id), participantRows.all(row.id)) });
    }
    if (action !== "reschedule") return res.status(400).json({ error: "Choose reschedule or cancel." });
    const { errors, values } = scheduleFields(req.body, row);
    if (Object.keys(errors).length) return res.status(400).json({ error: "Check the session details.", errors });
    database.prepare("UPDATE learning_sessions SET title = ?, description = ?, scheduled_at = ?, duration_minutes = ?, teacher_confirmed_at = NULL, learner_confirmed_at = NULL WHERE id = ?")
      .run(values.title, values.description, values.scheduledAt, values.durationMinutes, row.id);
    void dispatchEmailNotifications(database);
    return res.json({ session: publicSession(database.prepare(sessionSelect + "WHERE id = ?").get(row.id), participantRows.all(row.id)) });
  });

  router.get("/learning-sessions/:id/ice-servers", (req, res) => {
    const row = database.prepare(sessionSelect + "WHERE id = ?").get(req.params.id);
    if (!row || !hasAccess(database, row.id, req.user.id)) return res.status(404).json({ error: "Learning session not found." });
    if (row.cancelled_at || row.status === "completed") return res.status(409).json({ error: "This meeting is not available." });
    const now = Date.now(); const start = Date.parse(row.scheduled_at || ""); const end = start + row.duration_minutes * 60_000;
    if (!Number.isFinite(start) || now < start - 10 * 60_000 || now > end) return res.status(409).json({ error: "The meeting is not in its join window yet." });
    const iceServers = [];
    const stunUrl = process.env.STUN_URL || "stun:stun.l.google.com:19302";
    if (stunUrl) iceServers.push({ urls: stunUrl });
    const turnUrl = process.env.TURN_URL;
    const sharedSecret = process.env.TURN_SHARED_SECRET;
    if (turnUrl && sharedSecret) {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const username = expiry + ":" + req.user.id;
      const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
      iceServers.push({ urls: turnUrl.split(",").map((part) => part.trim()).filter(Boolean), username, credential });
    }
    return res.json({ iceServers });
  });

  return router;
}

export { hasAccess, meetingStatus };
