import { WebSocketServer, WebSocket } from "ws";
import { authenticateRequest } from "./auth.js";
import { hasAccess } from "./learning-sessions.js";
import { hasOpenRoomAccess } from "./open-learning-rooms.js";
import { isDevelopmentFrontendOrigin } from "./origin-policy.js";
import { persistMeetingMessage } from "./meeting-collaboration.js";

const send = (socket, data) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
};
const rejectUpgrade = (socket, status, message) => {
  const phrase = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 409 ? "Conflict" : "Bad Request";
  socket.write("HTTP/1.1 " + status + " " + phrase + "\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + Buffer.byteLength(message) + "\r\n\r\n" + message);
  socket.destroy();
};

export function attachMeetingSignaling(server, database) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  const rooms = new Map();
  const sessionQuery = database.prepare("SELECT id, status, scheduled_at, duration_minutes, cancelled_at FROM learning_sessions WHERE id = ?");
  const openRoomQuery = database.prepare("SELECT id, status, starts_at, duration_minutes FROM open_learning_rooms WHERE id = ?");
  const originAllowed = (request) => {
    const origin = request.headers.origin;
    if (!origin) return false;
    const configured = (process.env.APP_ORIGIN || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (configured.includes(origin) || isDevelopmentFrontendOrigin(origin)) return true;
    if (configured.length) return false;
    try { return new URL(origin).host === request.headers.host; } catch { return false; }
  };
  const heartbeat = setInterval(() => {
    for (const [roomKey, room] of rooms) {
      const isOpenRoom = roomKey.startsWith("open:");
      const roomId = isOpenRoom ? roomKey.slice(5) : roomKey;
      const session = isOpenRoom ? openRoomQuery.get(roomId) : sessionQuery.get(roomId);
      const start = Date.parse(session?.[isOpenRoom ? "starts_at" : "scheduled_at"] || "");
      const end = start + (session?.duration_minutes || 0) * 60_000;
      const expired = !session || (isOpenRoom ? session.status !== "open" : session.cancelled_at || session.status === "completed") || !Number.isFinite(start) || Date.now() > end;
      for (const participant of room.values()) {
        let authenticated = null;
        try { authenticated = authenticateRequest(database, participant.request); } catch { authenticated = null; }
        if (expired || !authenticated || authenticated.user.id !== participant.userId) participant.socket.close(expired ? 4409 : 4401, expired ? "Meeting is no longer available" : "Session expired");
      }
    }
  }, 10_000);
  heartbeat.unref?.();

  server.on("upgrade", (request, socket, head) => {
    let parsed;
    try { parsed = new URL(request.url, "http://localhost"); } catch { return rejectUpgrade(socket, 400, "Invalid meeting URL."); }
    const sessionMatch = /^\/api\/meetings\/([^/]+)\/signaling$/.exec(parsed.pathname);
    const openRoomMatch = /^\/api\/open-learning-rooms\/([^/]+)\/signaling$/.exec(parsed.pathname);
    const match = sessionMatch || openRoomMatch;
    if (!match) return;
    const isOpenRoom = Boolean(openRoomMatch);
    let sessionId;
    try { sessionId = decodeURIComponent(match[1]); } catch { return rejectUpgrade(socket, 400, "Invalid session ID."); }
    if (!originAllowed(request)) return rejectUpgrade(socket, 403, "Origin is not allowed.");
    let authenticated;
    try { authenticated = authenticateRequest(database, request); } catch { return rejectUpgrade(socket, 401, "Authentication required."); }
    if (!authenticated) return rejectUpgrade(socket, 401, "Authentication required.");
    if (!(isOpenRoom ? hasOpenRoomAccess(database, sessionId, authenticated.user.id) : hasAccess(database, sessionId, authenticated.user.id))) return rejectUpgrade(socket, 403, "You are not a room participant.");
    const session = isOpenRoom ? openRoomQuery.get(sessionId) : sessionQuery.get(sessionId);
    if (!session || (isOpenRoom ? session.status !== "open" : session.cancelled_at || session.status === "completed") || !(session[isOpenRoom ? "starts_at" : "scheduled_at"])) return rejectUpgrade(socket, 409, "This meeting is unavailable.");
    const start = Date.parse(session[isOpenRoom ? "starts_at" : "scheduled_at"]); const end = start + session.duration_minutes * 60_000; const now = Date.now();
    if (now < start - 10 * 60_000 || now > end) return rejectUpgrade(socket, 409, "This meeting is outside its join window.");

    wss.handleUpgrade(request, socket, head, (ws) => {
      const roomKey = isOpenRoom ? "open:" + sessionId : sessionId;
      let room = rooms.get(roomKey);
      if (!room) { room = new Map(); rooms.set(roomKey, room); }
      const existing = room.get(authenticated.user.id);
      if (existing?.readyState === WebSocket.OPEN) {
        send(existing, { type: "replaced" }); existing.close(4001, "Reconnected from another tab");
      }
      if (room.size >= 8 && !room.has(authenticated.user.id)) { ws.close(4002, "Learning room is full"); return; }
      const participant = { socket: ws, userId: authenticated.user.id, fullName: authenticated.user.fullName, request, windowStarted: Date.now(), signalCount: 0 };
      const existingParticipants = [...room.values()].filter((item) => item.userId !== participant.userId);
      room.set(participant.userId, participant);
      send(ws, { type: "joined", participants: existingParticipants.map((item) => ({ id: item.userId, fullName: item.fullName })) });
      for (const other of existingParticipants) send(other.socket, { type: "peer_joined", participant: { id: participant.userId, fullName: participant.fullName } });

      ws.on("message", (raw) => {
        const now = Date.now();
        if (now - participant.windowStarted >= 10_000) { participant.windowStarted = now; participant.signalCount = 0; }
        participant.signalCount += 1;
        if (participant.signalCount > 100) { ws.close(1008, "Too many signaling messages"); return; }
        let current;
        try { current = authenticateRequest(database, request); } catch { current = null; }
        if (!current || current.user.id !== participant.userId) { ws.close(4401, "Session expired"); return; }
        let message;
        try { message = JSON.parse(raw.toString()); } catch { send(ws, { type: "error", message: "Invalid signaling data." }); return; }
        if (message?.type === "chat") {
          if (typeof message.body !== "string" || message.body.length > 2000) { send(ws, { type: "chat_error", message: "Messages must be 2,000 characters or fewer." }); return; }
          try {
            const chatMessage = persistMeetingMessage(database, isOpenRoom ? "open-room" : "session", sessionId, participant.userId, participant.fullName, message.body);
            if (!chatMessage) { send(ws, { type: "chat_error", message: "Enter a message before sending." }); return; }
            for (const member of room.values()) send(member.socket, { type: "chat", chatMessage });
          } catch {
            send(ws, { type: "chat_error", message: "Couldn’t save this message. Please try again." });
          }
          return;
        }
        if (!message || !["offer", "answer", "ice"].includes(message.type) || typeof message.to !== "string" || !message.payload || typeof message.payload !== "object") {
          send(ws, { type: "error", message: "Unsupported signaling message." }); return;
        }
        const target = room.get(message.to);
        if (!target || target.userId === participant.userId || target.socket.readyState !== WebSocket.OPEN) {
          send(ws, { type: "error", message: "The other participant is not connected." }); return;
        }
        send(target.socket, { type: message.type, from: participant.userId, fromName: participant.fullName, payload: message.payload });
      });
      ws.on("close", () => {
        if (room.get(participant.userId)?.socket !== ws) return;
        room.delete(participant.userId);
        const remaining = [...room.values()][0];
        if (remaining) send(remaining.socket, { type: "peer_left", participantId: participant.userId });
        if (room.size === 0) rooms.delete(roomKey);
      });
    });
  });

  return { close: () => new Promise((resolve) => { clearInterval(heartbeat); for (const room of rooms.values()) for (const item of room.values()) item.socket.close(1001, "Server shutting down"); wss.close(() => resolve()); }) };
}
