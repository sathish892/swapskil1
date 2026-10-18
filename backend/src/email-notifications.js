import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

const reminderWindowMs = 15 * 60_000;
let transporter;
let warnedMissingConfig = false;
let dispatching = false;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const from = process.env.EMAIL_FROM;
  if (!host || !from) {
    if (!warnedMissingConfig) {
      console.warn("Email notifications are queued but not sent. Configure SMTP_HOST and EMAIL_FROM in backend/.env.");
      warnedMissingConfig = true;
    }
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number.parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
    });
  }
  return { client: transporter, from };
}

export function queueEmail(database, { recipientUserId, type, referenceId, scheduleKey = "", payload = {} }) {
  database.prepare(`
    INSERT OR IGNORE INTO email_notification_queue
      (id, recipient_user_id, notification_type, reference_id, schedule_key, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), recipientUserId, type, referenceId, scheduleKey, JSON.stringify(payload));
}

function queueUpcomingReminders(database) {
  const now = Date.now();
  const through = new Date(now + reminderWindowMs).toISOString();
  const sessions = database.prepare(`
    SELECT s.id, s.title, s.skill_name, s.scheduled_at, s.duration_minutes,
      p.user_id, p.role
    FROM learning_sessions s
    JOIN learning_session_participants p ON p.session_id = s.id
    JOIN users u ON u.id = p.user_id AND u.status = 'active'
    WHERE s.status = 'scheduled' AND s.cancelled_at IS NULL
      AND s.scheduled_at > ? AND s.scheduled_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM email_notification_queue q
        WHERE q.recipient_user_id = p.user_id AND q.notification_type = 'session_reminder'
          AND q.reference_id = s.id AND q.schedule_key = s.scheduled_at
      )
  `).all(new Date(now).toISOString(), through);
  for (const session of sessions) {
    queueEmail(database, {
      recipientUserId: session.user_id,
      type: "session_reminder",
      referenceId: session.id,
      scheduleKey: session.scheduled_at,
      payload: { title: session.title || session.skill_name, skill: session.skill_name, startsAt: session.scheduled_at, durationMinutes: session.duration_minutes, role: session.role },
    });
  }
}

function emailContent(row, baseUrl) {
  const payload = JSON.parse(row.payload || "{}");
  if (row.notification_type === "exchange_request") {
    const about = payload.skillName ? ` about ${payload.skillName}` : "";
    return {
      subject: `${payload.senderName || "A student"} sent you a SkillSwap request`,
      text: `${payload.senderName || "A student"} sent you an exchange request${about}.\n\nView it in SkillSwap: ${baseUrl}/requests`,
    };
  }
  if (row.notification_type === "request_update") {
    const outcome = payload.status === "accepted" ? "accepted" : "declined";
    return {
      subject: `Your SkillSwap request was ${outcome}`,
      text: `${payload.recipientName || "A student"} ${outcome} your exchange request${payload.skillName ? ` about ${payload.skillName}` : ""}.\n\nView your requests: ${baseUrl}/requests`,
    };
  }
  if (row.notification_type === "new_message") {
    return {
      subject: `${payload.senderName || "A student"} sent you a SkillSwap message`,
      text: `${payload.senderName || "A student"} sent you a new message in SkillSwap. Sign in to view it: ${baseUrl}/messages`,
    };
  }
  const date = new Date(payload.startsAt);
  const startsText = Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : "the scheduled time";
  return {
    subject: `SkillSwap session starts in about 15 minutes: ${payload.title || payload.skill || "Learning session"}`,
    text: `Your ${payload.role || "learning"} session${payload.skill ? ` about ${payload.skill}` : ""} starts at ${startsText} and lasts ${payload.durationMinutes || 60} minutes.\n\nOpen your sessions: ${baseUrl}/sessions`,
  };
}

export async function dispatchEmailNotifications(database) {
  if (dispatching) return;
  dispatching = true;
  try {
    try { queueUpcomingReminders(database); }
    catch (error) { console.error("Could not queue session reminders:", error.message); }
    const mail = getTransporter();
    if (!mail) return;

    const pending = database.prepare(`
    SELECT q.id, q.notification_type, q.payload, q.attempts, u.email
    FROM email_notification_queue q JOIN users u ON u.id = q.recipient_user_id
    WHERE q.sent_at IS NULL AND q.attempts < 10 AND u.status = 'active'
    ORDER BY q.created_at, q.id LIMIT 25
    `).all();
    const baseUrl = (process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    for (const row of pending) {
      try {
        if (row.notification_type === "session_reminder") {
          const current = database.prepare("SELECT scheduled_at, cancelled_at, status FROM learning_sessions WHERE id = ?").get(row.reference_id);
          if (!current || current.cancelled_at || current.status !== "scheduled" || current.scheduled_at !== row.schedule_key || Date.parse(current.scheduled_at) <= Date.now()) {
            database.prepare("UPDATE email_notification_queue SET sent_at = CURRENT_TIMESTAMP WHERE id = ? AND sent_at IS NULL").run(row.id);
            continue;
          }
        }
        const message = emailContent(row, baseUrl);
        await mail.client.sendMail({ from: mail.from, to: row.email, subject: message.subject, text: message.text });
        database.prepare("UPDATE email_notification_queue SET sent_at = CURRENT_TIMESTAMP, last_error = '' WHERE id = ? AND sent_at IS NULL").run(row.id);
      } catch (error) {
        database.prepare("UPDATE email_notification_queue SET attempts = attempts + 1, last_error = ? WHERE id = ? AND sent_at IS NULL")
          .run(String(error?.message || "Email delivery failed").slice(0, 500), row.id);
        console.warn(`Email notification ${row.id} failed and will retry:`, error?.message || "delivery error");
      }
    }
  } finally { dispatching = false; }
}
