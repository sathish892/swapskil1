import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "./auth.js";
import { createNotification } from "./notifications.js";
import { dispatchEmailNotifications, queueEmail } from "./email-notifications.js";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_TYPES = {
  "image/png": { extension: "png", test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { extension: "webp", test: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  "application/pdf": { extension: "pdf", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
  "text/plain": { extension: "txt", test: (b) => { try { new TextDecoder("utf-8", { fatal: true }).decode(b); return !b.includes(0); } catch { return false; } } },
  "video/mp4": { extension: "mp4", test: (b) => b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" },
  "video/webm": { extension: "webm", test: (b) => b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const safeError = (message) => ({ error: message });

function activeMember(database, conversationId, userId) {
  return database.prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL").get(conversationId, userId);
}

function isConversationContact(database, ownerId, contactId) {
  return database.prepare(
    "SELECT 1 FROM conversation_members mine " +
    "JOIN conversation_members contact ON contact.conversation_id = mine.conversation_id " +
    "WHERE mine.user_id = ? AND mine.left_at IS NULL AND contact.user_id = ? AND contact.left_at IS NULL LIMIT 1",
  ).get(ownerId, contactId);
}

function safeOriginalName(value) {
  const normalized = basename(String(value || "attachment").replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return normalized || "attachment";
}

function attachmentItem(row) {
  return {
    id: row.id, name: row.original_name, contentType: row.content_type, size: row.byte_size,
    url: "/api/attachments/" + encodeURIComponent(row.id),
  };
}

export function createMessagingRouter(database, options = {}) {
  const configuredDirectory = options.uploadDirectory || process.env.MESSAGE_UPLOAD_DIR || "./uploads";
  const uploadDirectory = isAbsolute(configuredDirectory) ? configuredDirectory : resolve(backendDirectory, configuredDirectory);
  const configuredMaxBytes = Number.parseInt(process.env.MESSAGE_ATTACHMENT_MAX_BYTES || "20971520", 10);
  const maxFileBytes = options.maxFileBytes || (Number.isInteger(configuredMaxBytes) && configuredMaxBytes > 0 ? Math.min(configuredMaxBytes, 20971520) : 20971520);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileBytes, files: 1, fields: 1, parts: 2 } });
  const sendLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, handler: (_req, res) => res.status(429).json(safeError("You are sending messages too quickly. Please wait and try again.")) });
  const manageLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, handler: (_req, res) => res.status(429).json(safeError("Too many conversation changes. Please wait and try again.")) });
  const router = Router();
  router.use(requireAuth(database));

  router.get("/conversations", (req, res) => {
    const rows = database.prepare(
      "SELECT c.id, c.kind, c.group_name, c.created_by, c.created_at, " +
      "(SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_body, " +
      "(SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at, " +
      "(SELECT u.full_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_sender, " +
      "(SELECT COUNT(*) FROM messages m JOIN conversation_members me ON me.conversation_id = m.conversation_id AND me.user_id = ? " +
      "WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.created_at > me.last_read_at) AS unread " +
      "FROM conversations c JOIN conversation_members mine ON mine.conversation_id = c.id " +
      "WHERE mine.user_id = ? AND mine.left_at IS NULL " +
      "ORDER BY COALESCE(last_at, c.created_at) DESC, c.id LIMIT 100",
    ).all(req.user.id, req.user.id, req.user.id);
    const membersQuery = database.prepare(
      "SELECT u.id, u.full_name, cm.joined_at FROM conversation_members cm JOIN users u ON u.id = cm.user_id " +
      "WHERE cm.conversation_id = ? AND cm.left_at IS NULL ORDER BY cm.joined_at, u.full_name",
    );
    const conversations = rows.map((row) => {
      const members = membersQuery.all(row.id).map((member) => ({ id: member.id, fullName: member.full_name }));
      const other = members.find((member) => member.id !== req.user.id);
      return {
        id: row.id, kind: row.kind, name: row.kind === "group" ? row.group_name : other?.fullName || "Direct conversation",
        createdBy: row.created_by, createdAt: row.created_at, members,
        lastMessage: row.last_at ? { text: row.last_body || "Attachment", senderName: row.last_sender, createdAt: row.last_at } : null,
        unreadCount: row.unread,
      };
    });
    return res.json({ conversations });
  });

  router.post("/conversations/direct", manageLimiter, (req, res) => {
    const otherUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    if (!otherUserId || otherUserId.length > 100) return res.status(400).json(safeError("Choose a valid student."));
    if (otherUserId === req.user.id) return res.status(400).json(safeError("You cannot start a conversation with yourself."));
    const other = database.prepare("SELECT id FROM users WHERE id = ?").get(otherUserId);
    if (!other) return res.status(404).json(safeError("Student not found."));
    const authorized = database.prepare(
      "SELECT 1 FROM exchange_requests WHERE status = 'accepted' AND ((sender_user_id = ? AND recipient_user_id = ?) OR (sender_user_id = ? AND recipient_user_id = ?)) " +
      "UNION SELECT 1 FROM learning_sessions WHERE (teacher_user_id = ? AND learner_user_id = ?) OR (teacher_user_id = ? AND learner_user_id = ?) LIMIT 1",
    ).get(req.user.id, otherUserId, otherUserId, req.user.id, req.user.id, otherUserId, otherUserId, req.user.id);
    if (!authorized) return res.status(403).json(safeError("Direct messaging is available after an exchange request is accepted."));
    const directKey = [req.user.id, otherUserId].sort().join(":");
    let conversation = database.prepare("SELECT id FROM conversations WHERE direct_key = ?").get(directKey);
    if (!conversation) {
      const id = randomUUID();
      try {
        database.exec("BEGIN IMMEDIATE;");
        database.prepare("INSERT INTO conversations (id, kind, direct_key, created_by) VALUES (?, 'direct', ?, ?)").run(id, directKey, req.user.id);
        database.prepare("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)").run(id, req.user.id, id, otherUserId);
        database.exec("COMMIT;"); conversation = { id };
      } catch (error) {
        try { database.exec("ROLLBACK;"); } catch { /* transaction already closed */ }
        conversation = database.prepare("SELECT id FROM conversations WHERE direct_key = ?").get(directKey);
        if (!conversation) throw error;
      }
    }
    return res.status(200).json({ conversation: { id: conversation.id } });
  });

  router.post("/groups", manageLimiter, (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
    const rawMembers = req.body?.memberIds === undefined ? [] : req.body.memberIds;
    if (!name || name.length > 80) return res.status(400).json(safeError("Group names must be from 1 to 80 characters."));
    if (!Array.isArray(rawMembers) || rawMembers.length < 1 || rawMembers.length > 49 || rawMembers.some((id) => typeof id !== "string" || id.length > 100)) return res.status(400).json(safeError("Select 1 to 49 people from your conversations."));
    const memberIds = [...new Set([req.user.id, ...rawMembers])];
    if (memberIds.length !== rawMembers.length + (rawMembers.includes(req.user.id) ? 0 : 1)) return res.status(400).json(safeError("The member list contains duplicates."));
    if (rawMembers.some((memberId) => !isConversationContact(database, req.user.id, memberId))) return res.status(403).json(safeError("You can only add people who are already in one of your conversations."));
    const placeholders = memberIds.map(() => "?").join(",");
    const found = database.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND id IN (" + placeholders + ")").get(...memberIds).count;
    if (found !== memberIds.length) return res.status(404).json(safeError("One or more students were not found."));
    const id = randomUUID();
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.prepare("INSERT INTO conversations (id, kind, group_name, created_by) VALUES (?, 'group', ?, ?)").run(id, name, req.user.id);
      const insertMember = database.prepare("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)");
      for (const userId of memberIds) insertMember.run(id, userId);
      database.exec("COMMIT;");
    } catch (error) { database.exec("ROLLBACK;"); throw error; }
    return res.status(201).json({ conversation: { id, name, kind: "group" } });
  });

  router.get("/conversations/:id/messages", (req, res) => {
    if (!activeMember(database, req.params.id, req.user.id)) return res.status(404).json(safeError("Conversation not found."));
    const rawLimit = req.query.limit === undefined ? "40" : req.query.limit;
    const limit = typeof rawLimit === "string" && /^\d+$/.test(rawLimit) ? Number(rawLimit) : 0;
    const before = req.query.before;
    if (limit < 1 || limit > 100 || (before !== undefined && (typeof before !== "string" || before.length > 100))) return res.status(400).json(safeError("Use a message limit from 1 to 100 and a valid cursor."));
    const cursorSql = before ? " AND (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = ? AND conversation_id = ?)" : "";
    const args = before ? [req.params.id, before, req.params.id, limit + 1] : [req.params.id, limit + 1];
    const rows = database.prepare(
      "SELECT m.id, m.body, m.created_at, u.id AS sender_id, u.full_name AS sender_name, " +
      "a.id AS attachment_id, a.original_name, a.content_type, a.byte_size " +
      "FROM messages m JOIN users u ON u.id = m.sender_id LEFT JOIN message_attachments a ON a.message_id = m.id " +
      "WHERE m.conversation_id = ?" + cursorSql + " ORDER BY m.created_at DESC, m.id DESC LIMIT ?",
    ).all(...args);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    database.prepare("UPDATE conversation_members SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL").run(req.params.id, req.user.id);
    const messages = page.map((row) => ({
      id: row.id, text: row.body, createdAt: row.created_at,
      sender: { id: row.sender_id, fullName: row.sender_name },
      attachment: row.attachment_id ? attachmentItem({ id: row.attachment_id, original_name: row.original_name, content_type: row.content_type, byte_size: row.byte_size }) : null,
    }));
    return res.json({ messages, hasMore, nextBefore: hasMore && page.length ? page[0].id : null });
  });

  router.post("/conversations/:id/messages", sendLimiter, (req, res, next) => {
    upload.single("attachment")(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json(safeError("Attachments must be no larger than " + Math.ceil(maxFileBytes / 1024 / 1024) + " MiB."));
        if (error instanceof multer.MulterError) return res.status(400).json(safeError("Upload one attachment at a time."));
        return next(error);
      }
      next();
    });
  }, async (req, res, next) => {
    try {
      if (!activeMember(database, req.params.id, req.user.id)) return res.status(404).json(safeError("Conversation not found."));
      const body = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (body.length > 5000) return res.status(400).json(safeError("Messages must be 5,000 characters or fewer."));
      if (!body && !req.file) return res.status(400).json(safeError("Write a message or attach a file."));
      let detected = null;
      if (req.file) {
        detected = Object.entries(FILE_TYPES).find(([mime, entry]) => mime === req.file.mimetype && entry.test(req.file.buffer));
        if (!detected) return res.status(415).json(safeError("Use PNG, JPEG, WebP, PDF, plain text, MP4, or WebM files with matching file content."));
      }
      const messageId = randomUUID();
      const attachmentId = req.file ? randomUUID() : null;
      const storageKey = req.file ? randomUUID() : null;
      const [contentType, fileInfo] = detected || [];
      const diskPath = req.file ? resolve(uploadDirectory, storageKey + "." + fileInfo.extension) : null;
      if (diskPath && !diskPath.startsWith(uploadDirectory + "/")) return res.status(400).json(safeError("Invalid attachment path."));
      if (req.file) await mkdir(uploadDirectory, { recursive: true });
      try {
        if (req.file) await writeFile(diskPath, req.file.buffer, { flag: "wx", mode: 0o600 });
        database.exec("BEGIN IMMEDIATE;");
        if (!activeMember(database, req.params.id, req.user.id)) { database.exec("ROLLBACK;"); if (diskPath) await unlink(diskPath).catch(() => {}); return res.status(404).json(safeError("Conversation not found.")); }
        database.prepare("INSERT INTO messages (id, conversation_id, sender_id, body) VALUES (?, ?, ?, ?)").run(messageId, req.params.id, req.user.id, body);
        if (req.file) database.prepare("INSERT INTO message_attachments (id, message_id, storage_key, extension, original_name, content_type, byte_size) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(attachmentId, messageId, storageKey, fileInfo.extension, safeOriginalName(req.file.originalname), contentType, req.file.size);
        const conversation = database.prepare("SELECT kind, group_name FROM conversations WHERE id = ?").get(req.params.id);
        const recipients = database.prepare(
          "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ? AND left_at IS NULL",
        ).all(req.params.id, req.user.id);
        const notificationTitle = conversation.kind === "group"
          ? `${req.user.fullName} sent a message in ${conversation.group_name || "your group"}`
          : `${req.user.fullName} sent you a message`;
        for (const recipient of recipients) {
          createNotification(database, {
            recipientUserId: recipient.user_id, actorUserId: req.user.id, type: "new_message",
            title: notificationTitle, body: "Open Messages to view it.", targetPath: "/messages", referenceId: messageId,
          });
          queueEmail(database, { recipientUserId: recipient.user_id, type: "new_message", referenceId: messageId, payload: { senderName: req.user.fullName } });
        }
        database.exec("COMMIT;");
      } catch (error) {
        try { database.exec("ROLLBACK;"); } catch { /* transaction may have ended */ }
        if (diskPath) await unlink(diskPath).catch(() => {});
        throw error;
      }
      void dispatchEmailNotifications(database);
      return res.status(201).json({ message: {
        id: messageId, text: body, createdAt: database.prepare("SELECT created_at FROM messages WHERE id = ?").get(messageId).created_at,
        sender: { id: req.user.id, fullName: req.user.fullName },
        attachment: req.file ? attachmentItem({ id: attachmentId, original_name: safeOriginalName(req.file.originalname), content_type: contentType, byte_size: req.file.size }) : null,
      } });
    } catch (error) { return next(error); }
  });

  router.post("/conversations/:id/members", manageLimiter, (req, res) => {
    const group = database.prepare("SELECT kind, created_by FROM conversations WHERE id = ?").get(req.params.id);
    if (!group || !activeMember(database, req.params.id, req.user.id)) return res.status(404).json(safeError("Group not found."));
    if (group.kind !== "group") return res.status(400).json(safeError("Members can only be added to group conversations."));
    if (group.created_by !== req.user.id) return res.status(403).json(safeError("Only the group creator can add members."));
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    if (!userId || userId === req.user.id) return res.status(400).json(safeError("Choose another valid student."));
    if (!database.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active'").get(userId)) return res.status(404).json(safeError("Student not found."));
    if (!isConversationContact(database, req.user.id, userId)) return res.status(403).json(safeError("You can only add people who are already in one of your conversations."));
    const memberCount = database.prepare("SELECT COUNT(*) AS count FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL").get(req.params.id).count;
    if (memberCount >= 50) return res.status(409).json(safeError("Groups can have up to 50 active members."));
    const existing = database.prepare("SELECT left_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?").get(req.params.id, userId);
    if (existing && existing.left_at === null) return res.status(409).json(safeError("This student is already a group member."));
    if (existing) database.prepare("UPDATE conversation_members SET joined_at = CURRENT_TIMESTAMP, left_at = NULL, last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?").run(req.params.id, userId);
    else database.prepare("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)").run(req.params.id, userId);
    return res.status(201).json({ member: { id: userId } });
  });

  router.delete("/conversations/:id/members/:userId", manageLimiter, (req, res) => {
    const group = database.prepare("SELECT kind, created_by FROM conversations WHERE id = ?").get(req.params.id);
    if (!group || !activeMember(database, req.params.id, req.user.id)) return res.status(404).json(safeError("Group not found."));
    if (group.kind !== "group") return res.status(400).json(safeError("Direct conversation members cannot be removed."));
    const leavingSelf = req.params.userId === req.user.id;
    if (!leavingSelf && group.created_by !== req.user.id) return res.status(403).json(safeError("Only the group creator can remove another member."));
    if (!leavingSelf && req.params.userId === group.created_by) return res.status(400).json(safeError("The creator must leave using the leave action."));
    const target = database.prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL").get(req.params.id, req.params.userId);
    if (!target) return res.status(404).json(safeError("Group member not found."));
    const activeCount = database.prepare("SELECT COUNT(*) AS count FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL").get(req.params.id).count;
    if (leavingSelf && group.created_by === req.user.id && activeCount > 1) {
      const successor = database.prepare("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ? AND left_at IS NULL ORDER BY joined_at, user_id LIMIT 1").get(req.params.id, req.user.id);
      database.prepare("UPDATE conversations SET created_by = ? WHERE id = ?").run(successor.user_id, req.params.id);
    }
    if (leavingSelf && group.created_by === req.user.id && activeCount === 1) {
      database.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
      return res.status(204).end();
    }
    database.prepare("UPDATE conversation_members SET left_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
    return res.status(204).end();
  });

  router.get("/attachments/:id", async (req, res, next) => {
    try {
      const row = database.prepare(
        "SELECT a.id, a.storage_key, a.extension, a.original_name, a.content_type, a.byte_size, m.conversation_id " +
        "FROM message_attachments a JOIN messages m ON m.id = a.message_id WHERE a.id = ?",
      ).get(req.params.id);
      if (!row || !activeMember(database, row.conversation_id, req.user.id)) return res.status(404).json(safeError("Attachment not found."));
      const diskPath = resolve(uploadDirectory, row.storage_key + "." + row.extension);
      if (!diskPath.startsWith(uploadDirectory + "/")) return res.status(404).json(safeError("Attachment not found."));
      const content = await readFile(diskPath);
      res.setHeader("Content-Type", row.content_type);
      res.setHeader("Content-Length", row.byte_size);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      const inline = req.query.inline === "1" && (IMAGE_TYPES.has(row.content_type) || row.content_type.startsWith("video/"));
      const fallbackName = row.original_name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/["\\]/g, "_");
      res.setHeader("Content-Disposition", (inline ? "inline" : "attachment") + "; filename=\"" + fallbackName + "\"; filename*=UTF-8''" + encodeURIComponent(row.original_name));
      return res.send(content);
    } catch (error) {
      if (error.code === "ENOENT") return res.status(404).json(safeError("Attachment file is unavailable."));
      return next(error);
    }
  });

  return router;
}
