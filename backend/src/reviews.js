import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./auth.js";
import { meetingStatus } from "./learning-sessions.js";

export function createReviewsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));
  const roomParticipants = database.prepare(
    "SELECT p.user_id AS id, u.full_name AS fullName, p.role FROM learning_session_participants p " +
    "JOIN users u ON u.id = p.user_id WHERE p.session_id = ? ORDER BY CASE p.role WHEN 'teacher' THEN 0 ELSE 1 END, lower(u.full_name)",
  );

  router.get("/learning-sessions", (req, res) => {
    const rows = database.prepare(
      "SELECT s.id, s.exchange_request_id, s.teacher_user_id, s.learner_user_id, teacher.full_name AS teacher_name, learner.full_name AS learner_name, " +
      "s.skill_name, s.status, s.title, s.description, s.scheduled_at, s.duration_minutes, s.created_by, s.cancelled_at, s.created_at, s.completed_at, " +
      "s.teacher_confirmed_at, s.learner_confirmed_at, " +
      "CASE WHEN s.teacher_user_id = ? THEN 'teacher' ELSE 'learner' END AS role, " +
      "CASE WHEN s.teacher_user_id = ? THEN s.learner_user_id ELSE s.teacher_user_id END AS other_id, " +
      "CASE WHEN s.teacher_user_id = ? THEN learner.full_name ELSE teacher.full_name END AS other_name " +
      "FROM learning_sessions s JOIN users teacher ON teacher.id = s.teacher_user_id " +
      "JOIN users learner ON learner.id = s.learner_user_id " +
      "WHERE EXISTS (SELECT 1 FROM learning_session_participants membership WHERE membership.session_id = s.id AND membership.user_id = ?) " +
      "ORDER BY s.created_at DESC, s.id",
    ).all(req.user.id, req.user.id, req.user.id, req.user.id);
    return res.json({ sessions: rows.map((row) => ({
      id: row.id, exchangeRequestId: row.exchange_request_id, skillName: row.skill_name, title: row.title || row.skill_name, description: row.description || "", scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes, createdBy: row.created_by, cancelledAt: row.cancelled_at, meetingStatus: meetingStatus(row), status: row.status, role: row.role,
      createdAt: row.created_at, completedAt: row.completed_at,
      youConfirmedCompletion: Boolean(row[row.role === "teacher" ? "teacher_confirmed_at" : "learner_confirmed_at"]),
      otherConfirmedCompletion: Boolean(row[row.role === "teacher" ? "learner_confirmed_at" : "teacher_confirmed_at"]),
      otherParticipant: { id: row.other_id, fullName: row.other_name },
      participants: roomParticipants.all(row.id),
    })) });
  });

  router.post("/learning-sessions/:id/confirm-completion", (req, res) => {
    const session = database.prepare(
      "SELECT id, status, cancelled_at, teacher_user_id, learner_user_id, teacher_confirmed_at, learner_confirmed_at " +
      "FROM learning_sessions WHERE id = ? AND (teacher_user_id = ? OR learner_user_id = ?)",
    ).get(req.params.id, req.user.id, req.user.id);
    if (!session) return res.status(404).json({ error: "Learning session not found." });
    if (session.cancelled_at) return res.status(409).json({ error: "Cancelled sessions cannot be marked complete." });
    if (session.status === "completed") return res.json({ session: { id: session.id, status: "completed" } });
    const isTeacher = session.teacher_user_id === req.user.id;
    const ownColumn = isTeacher ? "teacher_confirmed_at" : "learner_confirmed_at";
    const otherColumn = isTeacher ? "learner_confirmed_at" : "teacher_confirmed_at";
    database.prepare(
      "UPDATE learning_sessions SET " + ownColumn + " = COALESCE(" + ownColumn + ", CURRENT_TIMESTAMP), " +
      "status = CASE WHEN " + otherColumn + " IS NOT NULL THEN 'completed' ELSE 'scheduled' END, " +
      "completed_at = CASE WHEN " + otherColumn + " IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END " +
      "WHERE id = ? AND status = 'scheduled'",
    ).run(session.id);
    const updated = database.prepare("SELECT status, completed_at FROM learning_sessions WHERE id = ?").get(session.id);
    return res.json({ session: { id: session.id, status: updated.status, completedAt: updated.completed_at } });
  });

  router.get("/reviews/pending", (req, res) => {
    const rows = database.prepare(
      "SELECT s.id AS session_id, s.skill_name, s.completed_at, " +
      "CASE WHEN s.teacher_user_id = ? THEN 'learner' ELSE 'teacher' END AS rating_type, " +
      "CASE WHEN s.teacher_user_id = ? THEN s.learner_user_id ELSE s.teacher_user_id END AS recipient_id, " +
      "CASE WHEN s.teacher_user_id = ? THEN learner.full_name ELSE teacher.full_name END AS recipient_name " +
      "FROM learning_sessions s JOIN users teacher ON teacher.id = s.teacher_user_id " +
      "JOIN users learner ON learner.id = s.learner_user_id " +
      "WHERE s.status = 'completed' AND s.cancelled_at IS NULL AND (s.teacher_user_id = ? OR s.learner_user_id = ?) " +
      "AND NOT EXISTS (SELECT 1 FROM session_reviews r WHERE r.session_id = s.id AND r.reviewer_id = ? " +
      "AND r.rating_type = CASE WHEN s.teacher_user_id = ? THEN 'learner' ELSE 'teacher' END) " +
      "ORDER BY s.completed_at DESC, s.id",
    ).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
    return res.json({ reviews: rows.map((row) => ({
      sessionId: row.session_id, skillName: row.skill_name, completedAt: row.completed_at,
      ratingType: row.rating_type, recipient: { id: row.recipient_id, fullName: row.recipient_name },
    })) });
  });

  router.post("/reviews", (req, res) => {
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    const stars = req.body?.stars;
    const reviewText = req.body?.reviewText === undefined ? "" : req.body.reviewText;
    const errors = {};
    if (!sessionId || sessionId.length > 100) errors.sessionId = "Choose a valid session.";
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) errors.stars = "Choose a rating from 1 to 5 stars.";
    if (typeof reviewText !== "string" || reviewText.length > 1000) errors.reviewText = "Use 1,000 characters or fewer.";
    if (Object.keys(errors).length) return res.status(400).json({ error: "Check the review fields.", errors });

    const session = database.prepare(
      "SELECT id, status, cancelled_at, teacher_user_id, learner_user_id FROM learning_sessions WHERE id = ?",
    ).get(sessionId);
    if (!session || (session.teacher_user_id !== req.user.id && session.learner_user_id !== req.user.id)) {
      return res.status(404).json({ error: "Eligible completed session not found." });
    }
    if (session.cancelled_at) return res.status(409).json({ error: "Cancelled sessions cannot be reviewed." });
    if (session.status !== "completed") return res.status(409).json({ error: "Both participants must confirm completion before reviewing." });
    const isTeacher = session.teacher_user_id === req.user.id;
    const recipientId = isTeacher ? session.learner_user_id : session.teacher_user_id;
    if (recipientId === req.user.id) return res.status(403).json({ error: "You cannot review yourself." });
    const ratingType = isTeacher ? "learner" : "teacher";
    const id = randomUUID();
    try {
      database.prepare(
        "INSERT INTO session_reviews (id, session_id, reviewer_id, recipient_id, rating_type, stars, review_text) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(id, session.id, req.user.id, recipientId, ratingType, stars, reviewText.trim());
    } catch (error) {
      if (/UNIQUE constraint failed: session_reviews\.session_id, session_reviews\.reviewer_id, session_reviews\.rating_type/i.test(error.message)) {
        return res.status(409).json({ error: "You have already reviewed this session." });
      }
      throw error;
    }
    const createdAt = database.prepare("SELECT created_at FROM session_reviews WHERE id = ?").get(id).created_at;
    return res.status(201).json({ review: { id, sessionId: session.id, recipientId, ratingType, stars, reviewText: reviewText.trim(), createdAt } });
  });

  return router;
}
