import { createHmac, randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "./auth.js";

const MAX_PARTICIPANTS = 8;
const selectRoom = "SELECT id, creator_id, skill_id, skill_name, title, description, starts_at, duration_minutes, status, created_at, closed_at FROM open_learning_rooms ";

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

export const hasOpenRoomAccess = (database, roomId, userId) => Boolean(database.prepare(
  "SELECT 1 FROM open_learning_room_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL",
).get(roomId, userId));

function roomParticipants(database, roomId) {
  return database.prepare(
    "SELECT p.user_id AS id, u.full_name AS fullName, p.role FROM open_learning_room_participants p " +
    "JOIN users u ON u.id = p.user_id WHERE p.room_id = ? AND p.left_at IS NULL " +
    "ORDER BY CASE p.role WHEN 'teacher' THEN 0 ELSE 1 END, p.joined_at, lower(u.full_name)",
  ).all(roomId);
}

function roomIsOpen(room) {
  const start = Date.parse(room.starts_at);
  const end = start + room.duration_minutes * 60_000;
  return room.status === "open" && Number.isFinite(start) && Date.now() <= end;
}

function publicRoom(database, room) {
  return {
    id: room.id,
    title: room.title,
    skillName: room.skill_name,
    skill: room.skill_name,
    description: room.description,
    scheduledAt: room.starts_at,
    durationMinutes: room.duration_minutes,
    status: roomIsOpen(room) ? "open" : "ended",
    meetingStatus: roomIsOpen(room) ? "ongoing" : "completed",
    createdAt: room.created_at,
    createdBy: room.creator_id,
    participants: roomParticipants(database, room.id),
    capacity: MAX_PARTICIPANTS,
  };
}

export function createOpenLearningRoomsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));
  const reviewLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

  router.get("/open-learning-rooms", (req, res) => {
    const rooms = database.prepare(
      selectRoom + "WHERE status = 'open' AND datetime(starts_at, '+' || duration_minutes || ' minutes') > datetime('now') ORDER BY starts_at, created_at DESC LIMIT 100",
    ).all();
    return res.json({ rooms: rooms.map((room) => publicRoom(database, room)) });
  });

  router.post("/open-learning-rooms", (req, res) => {
    const skillId = typeof req.body?.skillId === "string" ? req.body.skillId.trim() : "";
    const skill = skillId ? database.prepare(
      "SELECT id, name FROM skills WHERE id = ? AND user_id = ? AND kind = 'teach'",
    ).get(skillId, req.user.id) : null;
    if (!skill) return res.status(400).json({ error: "Choose one of your skills you can teach." });

    const titleInput = typeof req.body?.title === "string" ? req.body.title.trim().replace(/\s+/g, " ") : "";
    const title = titleInput || skill.name + " learning room";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const durationMinutes = req.body?.durationMinutes === undefined ? 120 : req.body.durationMinutes;
    const errors = {};
    if (title.length < 3 || title.length > 120) errors.title = "Use a room title from 3 to 120 characters.";
    if (description.length > 1000) errors.description = "Use 1,000 characters or fewer.";
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) errors.durationMinutes = "Choose a duration from 15 to 240 minutes.";
    if (Object.keys(errors).length) return res.status(400).json({ error: "Check the room details.", errors });

    const id = randomUUID();
    const startsAt = new Date().toISOString();
    runInTransaction(database, () => {
      database.prepare("INSERT INTO open_learning_rooms (id, creator_id, skill_id, skill_name, title, description, starts_at, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, req.user.id, skill.id, skill.name, title, description, startsAt, durationMinutes);
      database.prepare("INSERT INTO open_learning_room_participants (room_id, user_id, role) VALUES (?, ?, 'teacher')").run(id, req.user.id);
    });
    return res.status(201).json({ room: publicRoom(database, database.prepare(selectRoom + "WHERE id = ?").get(id)) });
  });

  router.get("/open-learning-rooms/:id", (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    if (!room) return res.status(404).json({ error: "Learning room not found." });
    return res.json({ room: publicRoom(database, room) });
  });

  router.post("/open-learning-rooms/:id/join", (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    if (!room) return res.status(404).json({ error: "Learning room not found." });
    if (!roomIsOpen(room)) return res.status(409).json({ error: "This learning room has ended." });
    if (hasOpenRoomAccess(database, room.id, req.user.id)) return res.json({ room: publicRoom(database, room) });
    const count = database.prepare("SELECT COUNT(*) AS count FROM open_learning_room_participants WHERE room_id = ? AND left_at IS NULL").get(room.id).count;
    if (count >= MAX_PARTICIPANTS) return res.status(409).json({ error: "This learning room is full." });
    database.prepare("INSERT INTO open_learning_room_participants (room_id, user_id, role) VALUES (?, ?, 'learner') ON CONFLICT(room_id, user_id) DO UPDATE SET role = 'learner', joined_at = CURRENT_TIMESTAMP, left_at = NULL")
      .run(room.id, req.user.id);
    return res.status(200).json({ room: publicRoom(database, room) });
  });

  router.post("/open-learning-rooms/:id/leave", (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    if (!room || !hasOpenRoomAccess(database, room.id, req.user.id)) return res.status(404).json({ error: "You are not in this learning room." });
    if (room.creator_id === req.user.id) return res.status(409).json({ error: "The host can close the room instead." });
    database.prepare("UPDATE open_learning_room_participants SET left_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ? AND left_at IS NULL").run(room.id, req.user.id);
    return res.json({ left: true });
  });

  router.patch("/open-learning-rooms/:id", (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    if (!room) return res.status(404).json({ error: "Learning room not found." });
    if (room.creator_id !== req.user.id) return res.status(403).json({ error: "Only the room host can close this room." });
    if (req.body?.action !== "close") return res.status(400).json({ error: "Choose the close action." });
    database.prepare("UPDATE open_learning_rooms SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'").run(room.id);
    return res.json({ room: publicRoom(database, database.prepare(selectRoom + "WHERE id = ?").get(room.id)) });
  });

  router.get("/open-learning-rooms/:id/reviews/pending", (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    const reviewer = database.prepare("SELECT role, left_at FROM open_learning_room_participants WHERE room_id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!room || !reviewer) return res.status(404).json({ error: "Learning room not found." });
    // Room reviews are learner feedback for the teacher only.
    if (reviewer.role !== "learner") return res.json({ reviews: [] });
    if (room.status !== "closed" && reviewer.left_at === null) return res.status(409).json({ error: "Leave the room before writing a review." });
    const recipientRole = "teacher";
    const reviews = database.prepare(
      "SELECT p.user_id AS recipientId, u.full_name AS recipientName FROM open_learning_room_participants p " +
      "JOIN users u ON u.id = p.user_id LEFT JOIN open_room_reviews existing " +
      "ON existing.room_id = p.room_id AND existing.reviewer_id = ? AND existing.recipient_id = p.user_id " +
      "WHERE p.room_id = ? AND p.role = ? AND p.user_id <> ? AND u.status = 'active' AND existing.id IS NULL " +
      "ORDER BY lower(u.full_name), u.id",
    ).all(req.user.id, req.params.id, recipientRole, req.user.id).map((row) => ({
      roomId: req.params.id,
      skillName: room.skill_name,
      recipient: { id: row.recipientId, fullName: row.recipientName },
      ratingType: "teacher",
    }));
    return res.json({ reviews });
  });

  router.post("/open-learning-rooms/:id/reviews", reviewLimit, (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    const reviewer = database.prepare("SELECT role, left_at FROM open_learning_room_participants WHERE room_id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!room || !reviewer) return res.status(404).json({ error: "Learning room not found." });
    if (reviewer.role !== "learner") return res.status(403).json({ error: "Only learners can review the teacher." });
    if (room.status !== "closed" && reviewer.left_at === null) return res.status(409).json({ error: "Leave the room before writing a review." });

    const recipientId = typeof req.body?.recipientId === "string" ? req.body.recipientId.trim() : "";
    const stars = req.body?.stars;
    const reviewText = req.body?.reviewText === undefined ? "" : req.body.reviewText;
    if (!recipientId || recipientId.length > 100) return res.status(400).json({ error: "Choose a valid participant to review." });
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: "Choose a rating from 1 to 5 stars." });
    if (typeof reviewText !== "string" || reviewText.length > 1000) return res.status(400).json({ error: "Use 1,000 characters or fewer." });

    const requiredRole = "teacher";
    const recipient = database.prepare("SELECT role FROM open_learning_room_participants WHERE room_id = ? AND user_id = ?").get(req.params.id, recipientId);
    if (!recipient || recipient.role !== requiredRole || recipientId === req.user.id) return res.status(403).json({ error: "You can only review the teacher." });
    try {
      database.prepare(
        "INSERT INTO open_room_reviews (id, room_id, reviewer_id, recipient_id, rating_type, stars, review_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(randomUUID(), req.params.id, req.user.id, recipientId, "teacher", stars, reviewText.trim());
    } catch (error) {
      if (/UNIQUE constraint failed: open_room_reviews\.room_id, open_room_reviews\.reviewer_id, open_room_reviews\.recipient_id/i.test(error.message)) {
        return res.status(409).json({ error: "You have already reviewed this participant for the room." });
      }
      throw error;
    }
    return res.status(201).json({ review: { roomId: req.params.id, recipientId, ratingType: "teacher", stars } });
  });

  router.get("/open-learning-rooms/:id/ice-servers", (req, res) => {
    const room = database.prepare(selectRoom + "WHERE id = ?").get(req.params.id);
    if (!room || !hasOpenRoomAccess(database, room.id, req.user.id)) return res.status(404).json({ error: "Join this learning room before connecting." });
    if (!roomIsOpen(room)) return res.status(409).json({ error: "This learning room has ended." });
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
