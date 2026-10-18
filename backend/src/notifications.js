import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./auth.js";

export function createNotification(database, { recipientUserId, actorUserId, type, title, body = "", targetPath, referenceId }) {
  database.prepare(
    "INSERT INTO notifications (id, recipient_user_id, actor_user_id, notification_type, title, body, target_path, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), recipientUserId, actorUserId || null, type, title.slice(0, 160), body.slice(0, 240), targetPath, referenceId);
}

export function createNotificationsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));

  router.get("/notifications", (req, res) => {
    const rows = database.prepare(
      "SELECT n.id, n.notification_type AS type, n.title, n.body, n.target_path AS targetPath, n.reference_id AS referenceId, n.created_at AS createdAt, n.read_at AS readAt, u.full_name AS actorName " +
      "FROM notifications n LEFT JOIN users u ON u.id = n.actor_user_id WHERE n.recipient_user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 50",
    ).all(req.user.id);
    const unreadCount = database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL").get(req.user.id).count;
    return res.json({ notifications: rows, unreadCount });
  });

  router.post("/notifications/read-all", (req, res) => {
    database.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_user_id = ? AND read_at IS NULL").run(req.user.id);
    return res.json({ ok: true });
  });

  router.post("/notifications/:id/read", (req, res) => {
    const result = database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND recipient_user_id = ?").run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: "Notification not found." });
    return res.json({ ok: true });
  });
  return router;
}
