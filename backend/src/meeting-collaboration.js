import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./auth.js";
import { hasAccess } from "./learning-sessions.js";
import { hasOpenRoomAccess } from "./open-learning-rooms.js";

function roomAccess(database, type, id, userId) {
  return type === "session" ? hasAccess(database, id, userId) : hasOpenRoomAccess(database, id, userId);
}

export function createMeetingCollaborationRouter(database) {
  const router = Router();
  router.use(requireAuth(database));

  router.get("/meetings/:type/:id/chat", (req, res) => {
    const { type, id } = req.params;
    if (!["session", "open-room"].includes(type) || !id || id.length > 100 || !roomAccess(database, type, id, req.user.id)) {
      return res.status(404).json({ error: "Meeting not found." });
    }
    const messages = database.prepare(
      "SELECT m.id, m.sender_user_id AS senderId, u.full_name AS senderName, m.body, m.created_at AS createdAt " +
      "FROM meeting_chat_messages m JOIN users u ON u.id = m.sender_user_id " +
      "WHERE m.room_type = ? AND m.room_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 100",
    ).all(type, id).reverse();
    return res.json({ messages });
  });

  router.get("/meetings/:type/:id/notes", (req, res) => {
    const { type, id } = req.params;
    if (!["session", "open-room"].includes(type) || !id || id.length > 100 || !roomAccess(database, type, id, req.user.id)) {
      return res.status(404).json({ error: "Meeting not found." });
    }
    const row = database.prepare("SELECT body, updated_at AS updatedAt FROM meeting_notes WHERE room_type = ? AND room_id = ? AND user_id = ?").get(type, id, req.user.id);
    return res.json({ notes: row?.body || "", updatedAt: row?.updatedAt || null });
  });

  router.put("/meetings/:type/:id/notes", (req, res) => {
    const { type, id } = req.params;
    if (!["session", "open-room"].includes(type) || !id || id.length > 100 || !roomAccess(database, type, id, req.user.id)) {
      return res.status(404).json({ error: "Meeting not found." });
    }
    if (typeof req.body?.notes !== "string" || req.body.notes.length > 10000) return res.status(400).json({ error: "Notes must be 10,000 characters or fewer." });
    database.prepare(
      "INSERT INTO meeting_notes (room_type, room_id, user_id, body, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(room_type, room_id, user_id) DO UPDATE SET body = excluded.body, updated_at = CURRENT_TIMESTAMP",
    ).run(type, id, req.user.id, req.body.notes);
    return res.json({ notes: req.body.notes, saved: true });
  });

  return router;
}

export function persistMeetingMessage(database, type, id, userId, senderName, rawBody) {
  if (!roomAccess(database, type, id, userId)) throw new Error("Meeting participant access changed.");
  if (typeof rawBody !== "string") return null;
  const body = rawBody.trim();
  if (!body || body.length > 2000) return null;
  const messageId = randomUUID();
  database.prepare("INSERT INTO meeting_chat_messages (id, room_type, room_id, sender_user_id, body) VALUES (?, ?, ?, ?, ?)")
    .run(messageId, type, id, userId, body);
  const row = database.prepare("SELECT id, sender_user_id AS senderId, ? AS senderName, body, created_at AS createdAt FROM meeting_chat_messages WHERE id = ?").get(senderName, messageId);
  return row;
}
