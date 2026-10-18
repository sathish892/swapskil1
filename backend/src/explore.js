import { randomUUID } from "node:crypto";
import { Router } from "express";
import { avatarDirectory } from "./profile-skills.js";
import { requireAuth } from "./auth.js";
import { dispatchEmailNotifications, queueEmail } from "./email-notifications.js";
import { createNotification } from "./notifications.js";

const LEVELS = new Set(["Beginner", "Intermediate", "Advanced"]);
const CATEGORIES = new Set(["Technology", "Design", "Creative arts", "Business", "Languages", "Science", "Education", "Wellness", "Music", "Other"]);
const LANGUAGES = new Set(["English", "Tamil", "Hindi", "Telugu", "Malayalam", "Kannada", "Bengali", "Marathi", "Urdu", "French", "Spanish", "German", "Japanese", "Korean", "Mandarin", "Other"]);
const normalize = (text) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const profile = (row) => ({ id: row.user_id, fullName: row.full_name, bio: row.bio || "", interests: JSON.parse(row.interests || "[]"), avatarUrl: row.avatar_url || "" });
const skill = (row) => ({ id: row.id, kind: row.kind, name: row.name, category: row.category, experienceLevel: row.experience_level, description: row.description, instructionLanguage: row.instruction_language || "English" });
const queryValue = (value) => value === undefined ? "" : typeof value === "string" ? value : null;

function getPaging(query) {
  const limit = query.limit === undefined ? "20" : query.limit;
  const offset = query.offset === undefined ? "0" : query.offset;
  if (typeof limit !== "string" || !/^\d+$/.test(limit) || typeof offset !== "string" || !/^\d+$/.test(offset)) return null;
  const parsedLimit = Number(limit); const parsedOffset = Number(offset);
  return parsedLimit >= 1 && parsedLimit <= 50 && parsedOffset <= 10000 ? { limit: parsedLimit, offset: parsedOffset } : null;
}

export function createPublicProfilesRouter(database, avatarsDir = avatarDirectory) {
  const router = Router();
  router.get("/avatars/:filename", (req, res, next) => {
    const filename = req.params.filename;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(filename)) {
      return res.status(404).json({ error: "Avatar not found." });
    }
    return res.sendFile(filename, { root: avatarsDir, dotfiles: "deny", headers: { "Cache-Control": "public, max-age=86400" } }, (error) => {
      if (error && !res.headersSent) next(error.status === 404 ? Object.assign(new Error("Avatar not found."), { status: 404 }) : error);
    });
  });
  router.get("/profiles/:userId", (req, res) => {
    const row = database.prepare(
      "SELECT u.id AS user_id, u.full_name, p.bio, p.interests, p.learning_skills_public, p.avatar_url " +
      "FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status = 'active'",
    ).get(req.params.userId);
    if (!row) return res.status(404).json({ error: "Profile not found." });
    const publicProfile = { ...profile(row), learningSkillsPublic: Boolean(row.learning_skills_public) };
    const readSkills = database.prepare(
      "SELECT id, kind, name, category, experience_level, description, instruction_language FROM skills WHERE user_id = ? AND kind = ? ORDER BY name COLLATE NOCASE",
    );
    const summaryRows = database.prepare(
      "SELECT rating_type, ROUND(AVG(stars), 1) AS average, COUNT(*) AS count FROM (" +
      "SELECT r.recipient_id, r.rating_type, r.stars FROM session_reviews r JOIN learning_sessions s ON s.id = r.session_id " +
      "WHERE s.status = 'completed' AND s.cancelled_at IS NULL UNION ALL " +
      "SELECT r.recipient_id, r.rating_type, r.stars FROM open_room_reviews r JOIN open_learning_rooms room ON room.id = r.room_id " +
      "WHERE room.status = 'closed') eligible WHERE recipient_id = ? GROUP BY rating_type",
    ).all(row.user_id);
    const ratings = { teacher: { average: null, count: 0 }, learner: { average: null, count: 0 } };
    for (const rating of summaryRows) ratings[rating.rating_type] = { average: rating.average, count: rating.count };
    const writtenReviews = database.prepare(
      "SELECT eligible.id, eligible.rating_type, eligible.stars, eligible.review_text, eligible.created_at, u.id AS reviewer_id, u.full_name AS reviewer_name " +
      "FROM (SELECT r.id, r.recipient_id, r.reviewer_id, r.rating_type, r.stars, r.review_text, r.created_at FROM session_reviews r " +
      "JOIN learning_sessions s ON s.id = r.session_id WHERE s.status = 'completed' AND s.cancelled_at IS NULL UNION ALL " +
      "SELECT r.id, r.recipient_id, r.reviewer_id, r.rating_type, r.stars, r.review_text, r.created_at FROM open_room_reviews r " +
      "JOIN open_learning_rooms room ON room.id = r.room_id WHERE room.status = 'closed') eligible " +
      "JOIN users u ON u.id = eligible.reviewer_id WHERE eligible.recipient_id = ? " +
      "ORDER BY eligible.created_at DESC, eligible.id LIMIT 100",
    ).all(row.user_id);
    const reviews = { teacher: [], learner: [] };
    for (const review of writtenReviews) reviews[review.rating_type].push({
      id: review.id, stars: review.stars, reviewText: review.review_text, createdAt: review.created_at,
      reviewer: { id: review.reviewer_id, fullName: review.reviewer_name },
    });
    return res.json({
      profile: publicProfile,
      skills: {
        teach: readSkills.all(row.user_id, "teach").map(skill),
        learn: publicProfile.learningSkillsPublic ? readSkills.all(row.user_id, "learn").map(skill) : [],
      },
      ratings,
      reviews,
    });
  });
  return router;
}

function requestSummary(row, userId) {
  const incoming = row.recipient_user_id === userId;
  return {
    id: row.id, status: row.status, direction: incoming ? "incoming" : "outgoing",
    createdAt: row.created_at, updatedAt: row.updated_at,
    otherUser: incoming
      ? { id: row.sender_user_id, fullName: row.sender_full_name, bio: row.sender_bio || "" }
      : { id: row.recipient_user_id, fullName: row.recipient_full_name, bio: row.recipient_bio || "" },
    skill: row.skill_id ? { id: row.skill_id, name: row.skill_name, category: row.skill_category, kind: row.skill_kind, instructionLanguage: row.skill_language || "English" } : null,
  };
}

export function createExploreRouter(database) {
  const router = Router();
  router.use(requireAuth(database));

  router.get("/explore/skills", (req, res) => {
    const kind = queryValue(req.query.kind); const rawQuery = queryValue(req.query.q);
    const category = queryValue(req.query.category); const level = queryValue(req.query.experienceLevel);
    const instructionLanguage = queryValue(req.query.instructionLanguage);
    const paging = getPaging(req.query);
    if (!kind || !["teach", "learn"].includes(kind)) return res.status(400).json({ error: "Choose teach or learn for the skill type." });
    if (rawQuery === null || rawQuery.length > 120) return res.status(400).json({ error: "Search text must be 120 characters or fewer." });
    if (category === null || (category && !CATEGORIES.has(category))) return res.status(400).json({ error: "Choose a valid skill category." });
    if (level === null || (level && !LEVELS.has(level))) return res.status(400).json({ error: "Choose a valid experience level." });
    if (instructionLanguage === null || (instructionLanguage && !LANGUAGES.has(instructionLanguage))) return res.status(400).json({ error: "Choose a valid teaching language." });
    if (!paging) return res.status(400).json({ error: "Use a limit from 1–50 and an offset from 0–10000." });
    const normalizedQuery = normalize(rawQuery); const tokens = normalizedQuery ? normalizedQuery.split(" ") : [];
    const where = ["s.kind = ?", "s.user_id <> ?", "EXISTS (SELECT 1 FROM users active_user WHERE active_user.id = s.user_id AND active_user.status = 'active')"]; const args = [kind, req.user.id];
    where.push("(? = 'teach' OR EXISTS (SELECT 1 FROM profiles visibility WHERE visibility.user_id = s.user_id AND visibility.learning_skills_public = 1))");
    args.push(kind);
    for (const token of tokens) {
      where.push("lower(s.name) LIKE ? ESCAPE '\\'");
      args.push("%" + token.replace(/[\\%_]/g, "\\$&") + "%");
    }
    if (category) { where.push("s.category = ?"); args.push(category); }
    if (level) { where.push("s.experience_level = ?"); args.push(level); }
    if (instructionLanguage) { where.push("s.instruction_language = ?"); args.push(instructionLanguage); }
    const clause = where.join(" AND ");
    const total = database.prepare("SELECT count(*) AS total FROM skills s WHERE " + clause).get(...args).total;
    const rows = database.prepare(
      "SELECT s.id, s.kind, s.name, s.category, s.experience_level, s.description, s.instruction_language, " +
      "u.id AS user_id, u.full_name, p.bio, p.interests, p.avatar_url FROM skills s " +
      "JOIN users u ON u.id = s.user_id LEFT JOIN profiles p ON p.user_id = u.id WHERE " + clause +
      " ORDER BY s.name COLLATE NOCASE, u.full_name COLLATE NOCASE, s.id LIMIT ? OFFSET ?",
    ).all(...args, paging.limit, paging.offset);
    return res.json({
      results: rows.map((row) => ({ skill: skill(row), user: profile(row) })),
      total, limit: paging.limit, offset: paging.offset, query: normalizedQuery,
    });
  });

  router.get("/explore/matches", (req, res) => {
    const paging = getPaging(req.query);
    const rawQuery = queryValue(req.query.q);
    const category = queryValue(req.query.category);
    const level = queryValue(req.query.experienceLevel);
    const instructionLanguage = queryValue(req.query.instructionLanguage);
    if (!paging) return res.status(400).json({ error: "Use a limit from 1–50 and an offset from 0–10000." });
    if (rawQuery === null || rawQuery.length > 120) return res.status(400).json({ error: "Search text must be 120 characters or fewer." });
    if (category === null || (category && !CATEGORIES.has(category))) return res.status(400).json({ error: "Choose a valid skill category." });
    if (level === null || (level && !LEVELS.has(level))) return res.status(400).json({ error: "Choose a valid experience level." });
    if (instructionLanguage === null || (instructionLanguage && !LANGUAGES.has(instructionLanguage))) return res.status(400).json({ error: "Choose a valid teaching language." });
    const mine = database.prepare(
      "SELECT id, kind, name, category, experience_level, description, instruction_language FROM skills WHERE user_id = ? ORDER BY id",
    ).all(req.user.id);
    if (!mine.length) return res.json({ results: [], total: 0, limit: paging.limit, offset: paging.offset });

    const categories = [...new Set(mine.map((entry) => entry.category))];
    const groups = mine.map((entry) => "(" + normalize(entry.name).split(" ").map(() => "lower(s.name) LIKE ? ESCAPE '\\'").join(" AND ") + ")");
    const nameTerms = mine.flatMap((entry) => normalize(entry.name).split(" ").map((word) => "%" + word.replace(/[\\%_]/g, "\\$&") + "%"));
    const kinds = [...new Set(mine.map((entry) => entry.kind === "teach" ? "learn" : "teach"))];
    const rows = database.prepare(
      "SELECT s.id, s.user_id, s.kind, s.name, s.category, s.experience_level, s.description, s.instruction_language, " +
      "u.full_name, p.bio, p.interests, p.avatar_url FROM skills s JOIN users u ON u.id = s.user_id " +
      "LEFT JOIN profiles p ON p.user_id = u.id WHERE s.user_id <> ? AND u.status = 'active' AND (" +
      kinds.map(() => "s.kind = ?").join(" OR ") + ") AND (s.category IN (" +
      categories.map(() => "?").join(",") + ") OR " + groups.join(" OR ") +
      ") AND (s.kind = 'teach' OR EXISTS (SELECT 1 FROM profiles visibility WHERE visibility.user_id = s.user_id AND visibility.learning_skills_public = 1))" +
      " ORDER BY s.name COLLATE NOCASE, u.full_name COLLATE NOCASE, s.id LIMIT 3000",
    ).all(req.user.id, ...kinds, ...categories, ...nameTerms);

    const best = new Map();
    for (const candidate of rows) {
      for (const own of mine) {
        if (own.kind === candidate.kind) continue;
        if (normalize(own.instruction_language || "English") !== normalize(candidate.instruction_language || "English")) continue;
        if (instructionLanguage && candidate.instruction_language !== instructionLanguage) continue;
        const exact = normalize(own.name) === normalize(candidate.name);
        const sameCategory = own.category === candidate.category;
        if (!exact && !sameCategory) continue;
        const specificity = exact ? (sameCategory ? 4 : 3) : 2;
        const displayName = candidate.name.trim().replace(/\s+/g, " ");
        const why = exact
          ? (sameCategory ? "You both listed " + displayName + " in " + candidate.category + "." : "You both listed " + displayName + "; the categories differ.")
          : "You both have skills in " + candidate.category + "; this is a related-area suggestion.";
        const explanation = own.kind === "learn"
          ? "They can teach " + displayName + ", which you want to learn in " + candidate.instruction_language + ". " + why
          : "You can teach " + own.name + " in " + own.instruction_language + ", which they want to learn. " + why;
        const item = { user: profile(candidate), skill: skill(candidate), matchedSkill: skill(own), explanation, specificity };
        const previous = best.get(candidate.user_id);
        if (!previous || specificity > previous.specificity || (specificity === previous.specificity && candidate.id < previous.skill.id)) {
          best.set(candidate.user_id, item);
        }
      }
    }
    const normalizedQuery = normalize(rawQuery);
    const tokens = normalizedQuery ? normalizedQuery.split(" ") : [];
    const filtered = [...best.values()].filter((item) => {
      if (category && item.skill.category !== category) return false;
      if (level && item.skill.experienceLevel !== level) return false;
      if (instructionLanguage && item.skill.instructionLanguage !== instructionLanguage) return false;
      const name = normalize(item.skill.name);
      return tokens.every((token) => name.includes(token));
    });
    const ranked = filtered.sort((a, b) => b.specificity - a.specificity || a.user.fullName.localeCompare(b.user.fullName));
    const results = ranked.slice(paging.offset, paging.offset + paging.limit).map(({ specificity, ...item }) => item);
    return res.json({ results, total: ranked.length, limit: paging.limit, offset: paging.offset });
  });

  router.post("/exchange-requests", (req, res) => {
    const recipientId = typeof req.body?.recipientUserId === "string" ? req.body.recipientUserId : "";
    const skillId = typeof req.body?.skillId === "string" ? req.body.skillId : "";
    if (!recipientId || recipientId.length > 100 || !skillId || skillId.length > 100) return res.status(400).json({ error: "A recipient and a skill are required." });
    if (recipientId === req.user.id) return res.status(400).json({ error: "You cannot request an exchange with yourself." });
    const target = database.prepare(
      "SELECT s.id, s.user_id, s.kind, COALESCE(p.learning_skills_public, 0) AS learning_skills_public " +
      "FROM skills s JOIN users active_user ON active_user.id = s.user_id AND active_user.status = 'active' LEFT JOIN profiles p ON p.user_id = s.user_id WHERE s.id = ?",
    ).get(skillId);
    if (!target || target.user_id !== recipientId) return res.status(404).json({ error: "Skill or recipient not found." });
    if (target.kind === "learn" && !target.learning_skills_public) return res.status(404).json({ error: "Skill or recipient not found." });
    const id = randomUUID();
    const targetSkill = database.prepare("SELECT id, kind, name, category, experience_level, description, instruction_language FROM skills WHERE id = ?").get(skillId);
    try {
      database.exec("BEGIN IMMEDIATE;");
      const activeForPair = database.prepare(
        "SELECT id FROM exchange_requests WHERE sender_user_id = ? AND recipient_user_id = ? AND status IN ('pending','accepted') LIMIT 1",
      ).get(req.user.id, recipientId);
      if (activeForPair) {
        database.exec("ROLLBACK;");
        return res.status(409).json({ error: "You already have an active request with this student. One request is enough; check Requests for its status." });
      }
      database.prepare("INSERT INTO exchange_requests (id, sender_user_id, recipient_user_id, skill_id) VALUES (?, ?, ?, ?)")
        .run(id, req.user.id, recipientId, skillId);
      const senderName = database.prepare("SELECT full_name FROM users WHERE id = ?").get(req.user.id)?.full_name || "A student";
      createNotification(database, { recipientUserId: recipientId, actorUserId: req.user.id, type: "exchange_request", title: `${senderName} sent you a request`, body: `About ${targetSkill.name}`, targetPath: "/requests", referenceId: id });
      queueEmail(database, { recipientUserId: recipientId, type: "exchange_request", referenceId: id, payload: { senderName, skillName: targetSkill.name } });
      database.exec("COMMIT;");
      void dispatchEmailNotifications(database);
    } catch (error) {
      try { database.exec("ROLLBACK;"); } catch { /* transaction may already be closed */ }
      if (/UNIQUE constraint failed: exchange_requests\.sender_user_id, exchange_requests\.recipient_user_id/i.test(error.message)) {
        return res.status(409).json({ error: "You already have an active request with this student. One request is enough; check Requests for its status." });
      }
      throw error;
    }
    return res.status(201).json({ request: { id, status: "pending", skill: skill(targetSkill) } });
  });

  router.get("/exchange-requests", (req, res) => {
    const rows = database.prepare(
      "SELECT r.id, r.sender_user_id, r.recipient_user_id, r.skill_id, r.status, r.created_at, r.updated_at, " +
      "su.full_name AS sender_full_name, sp.bio AS sender_bio, ru.full_name AS recipient_full_name, rp.bio AS recipient_bio, " +
      "s.name AS skill_name, s.category AS skill_category, s.kind AS skill_kind, s.instruction_language AS skill_language FROM exchange_requests r " +
      "JOIN users su ON su.id = r.sender_user_id JOIN users ru ON ru.id = r.recipient_user_id " +
      "LEFT JOIN profiles sp ON sp.user_id = su.id LEFT JOIN profiles rp ON rp.user_id = ru.id " +
      "LEFT JOIN skills s ON s.id = r.skill_id WHERE r.sender_user_id = ? OR r.recipient_user_id = ? " +
      "ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, r.created_at DESC",
    ).all(req.user.id, req.user.id);
    return res.json({ requests: rows.map((row) => requestSummary(row, req.user.id)) });
  });

  router.patch("/exchange-requests/:id", (req, res) => {
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    if (!["accept", "reject"].includes(action)) return res.status(400).json({ error: "Choose accept or reject." });
    const existing = database.prepare("SELECT id, status, sender_user_id, recipient_user_id, skill_id FROM exchange_requests WHERE id = ? AND recipient_user_id = ?").get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: "Exchange request not found." });
    if (existing.status !== "pending") return res.status(409).json({ error: "This request has already been decided." });
    const status = action === "accept" ? "accepted" : "rejected";
    let learningSessionId = null;
    try {
      database.exec("BEGIN IMMEDIATE;");
      if (action === "accept") {
        const target = existing.skill_id ? database.prepare("SELECT kind, name FROM skills WHERE id = ?").get(existing.skill_id) : null;
        if (!target) {
          database.exec("ROLLBACK;");
          return res.status(409).json({ error: "The related skill was removed, so this request cannot start a session." });
        }
        learningSessionId = randomUUID();
        const changed = database.prepare(
          "UPDATE exchange_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND recipient_user_id = ? AND status = 'pending'",
        ).run(req.params.id, req.user.id);
        if (!changed.changes) {
          database.exec("ROLLBACK;");
          return res.status(409).json({ error: "This request has already been decided." });
        }
        const teacherId = target.kind === "teach" ? existing.recipient_user_id : existing.sender_user_id;
        const learnerId = target.kind === "teach" ? existing.sender_user_id : existing.recipient_user_id;
        database.prepare(
          "INSERT INTO learning_sessions (id, exchange_request_id, teacher_user_id, learner_user_id, skill_name) VALUES (?, ?, ?, ?, ?)",
        ).run(learningSessionId, req.params.id, teacherId, learnerId, target.name);
        const addParticipant = database.prepare("INSERT INTO learning_session_participants (session_id, user_id, role) VALUES (?, ?, ?)");
        addParticipant.run(learningSessionId, teacherId, "teacher");
        addParticipant.run(learningSessionId, learnerId, "learner");
      } else {
        const changed = database.prepare(
          "UPDATE exchange_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND recipient_user_id = ? AND status = 'pending'",
        ).run(req.params.id, req.user.id);
        if (!changed.changes) {
          database.exec("ROLLBACK;");
          return res.status(409).json({ error: "This request has already been decided." });
        }
      }
      const skillName = database.prepare("SELECT name FROM skills WHERE id = ?").get(existing.skill_id)?.name || "your skill exchange";
      const recipientName = database.prepare("SELECT full_name FROM users WHERE id = ?").get(req.user.id)?.full_name || "A student";
      createNotification(database, {
        recipientUserId: existing.sender_user_id, actorUserId: req.user.id, type: "request_update",
        title: `${recipientName} ${status} your request`, body: `About ${skillName}`,
        targetPath: "/requests", referenceId: req.params.id,
      });
      queueEmail(database, { recipientUserId: existing.sender_user_id, type: "request_update", referenceId: req.params.id, payload: { recipientName, status, skillName } });
      database.exec("COMMIT;");
      void dispatchEmailNotifications(database);
      return res.json({ request: { id: req.params.id, status, ...(learningSessionId ? { learningSessionId } : {}) } });
    } catch (error) {
      try { database.exec("ROLLBACK;"); } catch { /* transaction may already be closed */ }
      throw error;
    }
  });

  return router;
}
