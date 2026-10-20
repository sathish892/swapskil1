import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { migrateDatabase, openDatabase } from "../src/database.js";

const database = openDatabase(":memory:");
migrateDatabase(database);
const app = createApp(database, { cookieSecure: false });
const teacherId = randomUUID();
const learnerId = randomUUID();
const skillId = randomUUID();
const roomId = randomUUID();
const sessionToken = "learning-room-api-test-session";
let server;
let baseUrl;

before(async () => {
  database.prepare("INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)")
    .run(teacherId, "Room Teacher", "teacher@example.test", "unused-test-hash");
  database.prepare("INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)")
    .run(learnerId, "Room Learner", "learner@example.test", "unused-test-hash");
  database.prepare("INSERT INTO skills (id, user_id, kind, name, normalized_name, category, experience_level, description) VALUES (?, ?, 'teach', 'JavaScript', 'javascript', 'Technology', 'Beginner', 'Test skill description')")
    .run(skillId, teacherId);
  database.prepare("INSERT INTO open_learning_rooms (id, creator_id, skill_id, skill_name, title, starts_at, duration_minutes) VALUES (?, ?, ?, 'JavaScript', 'JavaScript class', ?, 60)")
    .run(roomId, teacherId, skillId, new Date().toISOString());
  database.prepare("INSERT INTO open_learning_room_participants (room_id, user_id, role) VALUES (?, ?, 'teacher')")
    .run(roomId, teacherId);
  database.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(sessionToken).digest("hex"), learnerId, Date.now(), Date.now() + 60 * 60_000);

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  database.close();
});

test("learner can load, join, and use an open learning room", async () => {
  const headers = { Cookie: `skillswap.sid=${sessionToken}` };

  const listResponse = await fetch(`${baseUrl}/api/open-learning-rooms`, { headers });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).rooms[0].id, roomId);

  const joinResponse = await fetch(`${baseUrl}/api/open-learning-rooms/${roomId}/join`, { method: "POST", headers });
  assert.equal(joinResponse.status, 200);
  assert.equal((await joinResponse.json()).room.status, "open");

  const detailsResponse = await fetch(`${baseUrl}/api/open-learning-rooms/${roomId}`, { headers });
  assert.equal(detailsResponse.status, 200);
  assert.equal((await detailsResponse.json()).room.skillName, "JavaScript");

  const iceResponse = await fetch(`${baseUrl}/api/open-learning-rooms/${roomId}/ice-servers`, { headers });
  assert.equal(iceResponse.status, 200);
  assert.ok(Array.isArray((await iceResponse.json()).iceServers));

  const chatResponse = await fetch(`${baseUrl}/api/meetings/open-room/${roomId}/chat`, { headers });
  assert.equal(chatResponse.status, 200);
  assert.deepEqual((await chatResponse.json()).messages, []);
});
