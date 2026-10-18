import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./auth.js";
import { hasAccess } from "./learning-sessions.js";
import { hasOpenRoomAccess } from "./open-learning-rooms.js";

const tickets = new Map();
const TICKET_TTL_MS = 30_000;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function removeExpiredTickets(now = Date.now()) {
  for (const [key, ticket] of tickets) if (ticket.expiresAt <= now) tickets.delete(key);
}

function issueTicket(user, type, resourceId) {
  removeExpiredTickets();
  const value = randomBytes(32).toString("base64url");
  tickets.set(hash(value), {
    userId: user.id,
    sessionTokenHash: user.sessionTokenHash,
    type,
    resourceId,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return value;
}

/** Consume each short-lived signaling ticket exactly once. */
export function consumeMeetingTicket(value) {
  if (typeof value !== "string" || value.length > 100) return null;
  const key = hash(value);
  const ticket = tickets.get(key);
  tickets.delete(key);
  if (!ticket || ticket.expiresAt <= Date.now()) return null;
  return ticket;
}

export function getActiveMeetingTicketUser(database, ticket) {
  return database.prepare(
    "SELECT u.id, u.full_name AS fullName FROM sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ? AND s.user_id = ? AND s.expires_at > ? AND u.status = 'active'",
  ).get(ticket.sessionTokenHash, ticket.userId, Date.now()) || null;
}

export function createMeetingTicketsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));

  router.post("/meetings/:id/signaling-ticket", (request, response) => {
    if (!hasAccess(database, request.params.id, request.user.id)) {
      return response.status(404).json({ error: "Learning session not found." });
    }
    return response.json({ ticket: issueTicket({ ...request.user, sessionTokenHash: request.sessionTokenHash }, "session", request.params.id) });
  });

  router.post("/open-learning-rooms/:id/signaling-ticket", (request, response) => {
    if (!hasOpenRoomAccess(database, request.params.id, request.user.id)) {
      return response.status(404).json({ error: "You are not in this learning room." });
    }
    return response.json({ ticket: issueTicket({ ...request.user, sessionTokenHash: request.sessionTokenHash }, "open-room", request.params.id) });
  });

  return router;
}
