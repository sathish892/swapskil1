import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrateDatabase, openDatabase } from "../src/database.js";
import { loadMeetingMessages } from "../src/meeting-collaboration.js";
import { findOpenRooms } from "../src/open-learning-rooms.js";

function withDatabase(callback) {
  const database = openDatabase(":memory:");
  migrateDatabase(database);
  try { callback(database); }
  finally { database.close(); }
}

test("open room listing returns only rooms inside their active time window", () => {
  withDatabase((database) => {
    const now = Date.UTC(2026, 0, 1, 12);
    const teacherId = randomUUID();
    const skillId = randomUUID();
    database.prepare("INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)")
      .run(teacherId, "Room Teacher", "teacher@example.test", "unused-test-hash");
    database.prepare("INSERT INTO skills (id, user_id, kind, name, normalized_name, category, experience_level, description) VALUES (?, ?, 'teach', 'JavaScript', 'javascript', 'Technology', 'Beginner', 'Test skill description')")
      .run(skillId, teacherId);
    const addRoom = (title, startsAt, durationMinutes, status = "open") => database.prepare(
      "INSERT INTO open_learning_rooms (id, creator_id, skill_id, skill_name, title, starts_at, duration_minutes, status) VALUES (?, ?, ?, 'JavaScript', ?, ?, ?, ?)",
    ).run(randomUUID(), teacherId, skillId, title, startsAt, durationMinutes, status);

    addRoom("Active class", new Date(now - 30 * 60_000).toISOString(), 60);
    addRoom("Expired class", new Date(now - 5 * 60 * 60_000).toISOString(), 60);
    addRoom("Future class", new Date(now + 30 * 60_000).toISOString(), 60);
    addRoom("Closed class", new Date(now - 10 * 60_000).toISOString(), 60, "closed");

    assert.deepEqual(findOpenRooms(database, now).map((room) => room.title), ["Active class"]);
  });
});

test("open room listing does not compare timestamp columns to text parameters", () => {
  const now = Date.UTC(2026, 0, 1, 12);
  let query = "";
  let parameters = null;
  const database = {
    prepare(sql) {
      query = sql;
      return { all(...values) { parameters = values; return []; } };
    },
  };

  assert.deepEqual(findOpenRooms(database, now), []);
  assert.match(query, /WHERE status = 'open'/);
  assert.match(query, /LIMIT 1000$/);
  assert.doesNotMatch(query, /starts_at\s*[<>]=?\s*\?/i);
  assert.deepEqual(parameters, []);
});

test("meeting chat history query is portable and returns oldest-to-newest messages", () => {
  withDatabase((database) => {
    const senderId = randomUUID();
    database.prepare("INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)")
      .run(senderId, "Room Learner", "learner@example.test", "unused-test-hash");
    database.prepare("INSERT INTO meeting_chat_messages (id, room_type, room_id, sender_user_id, body, created_at) VALUES (?, 'open-room', 'room-1', ?, ?, '2026-01-01 12:00:00')")
      .run("message-a", senderId, "First");
    database.prepare("INSERT INTO meeting_chat_messages (id, room_type, room_id, sender_user_id, body, created_at) VALUES (?, 'open-room', 'room-1', ?, ?, '2026-01-01 12:00:00')")
      .run("message-b", senderId, "Second");

    assert.deepEqual(loadMeetingMessages(database, "open-room", "room-1").map((message) => message.body), ["First", "Second"]);
  });
});
