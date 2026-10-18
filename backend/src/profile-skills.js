import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "./auth.js";

const LEVELS = new Set(["Beginner", "Intermediate", "Advanced"]);
const CATEGORIES = new Set([
  "Technology", "Design", "Creative arts", "Business", "Languages", "Science",
  "Education", "Wellness", "Music", "Other",
]);
const LANGUAGES = new Set(["English", "Tamil", "Hindi", "Telugu", "Malayalam", "Kannada", "Bengali", "Marathi", "Urdu", "French", "Spanish", "German", "Japanese", "Korean", "Mandarin", "Other"]);
const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const avatarDirectory = resolve(backendDirectory, process.env.AVATAR_UPLOAD_DIR || "./uploads/avatars");
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function profileInput(body) {
  const errors = {};
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  const institution = typeof body.institution === "string" ? body.institution.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const learningSkillsPublic = body.learningSkillsPublic === true;
  const interests = Array.isArray(body.interests)
    ? body.interests.map((interest) => typeof interest === "string" ? interest.trim() : "")
    : [];

  if (!fullName) errors.fullName = "Enter your full name.";
  else if (Array.from(fullName).length > 100) errors.fullName = "Use 100 characters or fewer.";
  if (Array.from(bio).length > 500) errors.bio = "Use 500 characters or fewer.";
  if (Array.from(institution).length > 150) errors.institution = "Use 150 characters or fewer.";
  if (Array.from(department).length > 100) errors.department = "Use 100 characters or fewer.";
  if (Array.from(location).length > 100) errors.location = "Use 100 characters or fewer.";
  if (!Array.isArray(body.interests)) errors.interests = "Choose up to 12 interests.";
  else if (interests.length > 12 || interests.some((interest) => !interest || Array.from(interest).length > 40)) {
    errors.interests = "Add up to 12 interests, each 1–40 characters long.";
  }
  const normalizedInterests = [...new Set(interests.map((interest) => interest.toLowerCase()))];
  if (normalizedInterests.length !== interests.length) errors.interests = "Remove duplicate interests.";
  if (Object.hasOwn(body, "learningSkillsPublic") && typeof body.learningSkillsPublic !== "boolean") {
    errors.learningSkillsPublic = "Choose whether learning goals are public.";
  }
  return { errors, values: { fullName, bio, institution, department, location, interests, learningSkillsPublic } };
}

function skillInput(body) {
  const errors = {};
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const experienceLevel = typeof body.experienceLevel === "string" ? body.experienceLevel : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const instructionLanguage = typeof body.instructionLanguage === "string" ? body.instructionLanguage.trim() : "English";
  if (!name) errors.name = "Enter a skill name.";
  else if (Array.from(name).length > 80) errors.name = "Use 80 characters or fewer.";
  if (!CATEGORIES.has(category)) errors.category = "Choose a category from the list.";
  if (!LANGUAGES.has(instructionLanguage)) errors.instructionLanguage = "Choose a supported language.";
  if (!LEVELS.has(experienceLevel)) errors.experienceLevel = "Choose a valid experience level.";
  if (!description) errors.description = "Add a short description.";
  else if (Array.from(description).length > 300) errors.description = "Use 300 characters or fewer.";
  return { errors, values: { name, normalizedName: name.toLocaleLowerCase("en"), category, experienceLevel, description, instructionLanguage } };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function publicProfile(database, userId) {
  const row = database.prepare(`
    SELECT u.id, u.full_name, p.bio, p.institution, p.department, p.location, p.interests, p.learning_skills_public, p.avatar_url, p.updated_at
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?
  `).get(userId);
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    bio: row.bio ?? "",
    institution: row.institution ?? "",
    department: row.department ?? "",
    location: row.location ?? "",
    interests: JSON.parse(row.interests ?? "[]"),
    learningSkillsPublic: Boolean(row.learning_skills_public),
    avatarUrl: row.avatar_url || "",
    updatedAt: row.updated_at,
  };
}

function publicSkill(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    category: row.category,
    experienceLevel: row.experience_level,
    description: row.description,
    instructionLanguage: row.instruction_language || "English",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProfileSkillsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));

  router.get("/profile", (request, response, next) => {
    try {
      const userId = request.user.id;
      database.prepare("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)").run(userId);
      return response.json({ profile: publicProfile(database, userId) });
    } catch (error) {
      return next(error);
    }
  });

  router.put("/profile", (request, response, next) => {
    const body = isPlainObject(request.body) ? request.body : {};
    const { errors, values } = profileInput(body);
    if (Object.keys(errors).length) return response.status(400).json({ error: "Check the highlighted fields.", errors });
    try {
      const updateProfile = database.prepare(`
        INSERT INTO profiles (user_id, bio, institution, department, location, interests, learning_skills_public, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio, institution = excluded.institution,
          department = excluded.department, location = excluded.location, interests = excluded.interests,
          learning_skills_public = excluded.learning_skills_public, updated_at = CURRENT_TIMESTAMP
      `);
      database.exec("BEGIN IMMEDIATE;");
      database.prepare("UPDATE users SET full_name = ? WHERE id = ?").run(values.fullName, request.user.id);
      updateProfile.run(request.user.id, values.bio, values.institution, values.department, values.location, JSON.stringify(values.interests), Number(values.learningSkillsPublic));
      database.exec("COMMIT;");
      return response.json({ profile: publicProfile(database, request.user.id) });
    } catch (error) {
      try { database.exec("ROLLBACK;"); } catch { /* transaction may already be closed */ }
      return next(error);
    }
  });

  router.post("/profile/avatar", (request, response, next) => {
    avatarUpload.single("photo")(request, response, (uploadError) => {
      if (uploadError) return response.status(uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: uploadError.code === "LIMIT_FILE_SIZE" ? "Choose a photo under 2 MB." : "Choose one PNG, JPEG, or WebP photo." });
      const file = request.file;
      if (!file) return response.status(400).json({ error: "Choose a photo to upload." });
      const isPng = file.mimetype === "image/png" && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg = file.mimetype === "image/jpeg" && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
      const isWebp = file.mimetype === "image/webp" && file.buffer.toString("ascii", 0, 4) === "RIFF" && file.buffer.toString("ascii", 8, 12) === "WEBP";
      if (!isPng && !isJpeg && !isWebp) return response.status(400).json({ error: "Photo must be a valid PNG, JPEG, or WebP image." });
      const extension = isPng ? "png" : isJpeg ? "jpg" : "webp";
      const filename = `${randomUUID()}.${extension}`;
      const destination = resolve(avatarDirectory, filename);
      try {
        mkdirSync(avatarDirectory, { recursive: true });
        writeFileSync(destination, file.buffer, { flag: "wx", mode: 0o640 });
        const previous = database.prepare("SELECT avatar_url FROM profiles WHERE user_id = ?").get(request.user.id)?.avatar_url || "";
        database.prepare(`INSERT INTO profiles (user_id, avatar_url, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET avatar_url = excluded.avatar_url, updated_at = CURRENT_TIMESTAMP`)
          .run(request.user.id, `/api/public/avatars/${filename}`);
        const previousName = previous.split("/").pop() || "";
        if (/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(previousName)) {
          const previousPath = resolve(avatarDirectory, previousName);
          if (existsSync(previousPath)) unlinkSync(previousPath);
        }
        return response.status(201).json({ avatarUrl: `/api/public/avatars/${filename}` });
      } catch (error) {
        try { if (existsSync(destination)) unlinkSync(destination); } catch { /* keep original upload error */ }
        return next(error);
      }
    });
  });

  router.get("/skills", (request, response, next) => {
    try {
      const rows = database.prepare(`
        SELECT id, kind, name, category, experience_level, description, instruction_language, created_at, updated_at
        FROM skills WHERE user_id = ? ORDER BY created_at DESC, id
      `).all(request.user.id);
      return response.json({ skills: rows.map(publicSkill) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/skills/:kind", (request, response, next) => {
    const { kind } = request.params;
    if (kind !== "teach" && kind !== "learn") return response.status(404).json({ error: "Skill type not found." });
    const { errors, values } = skillInput(isPlainObject(request.body) ? request.body : {});
    if (Object.keys(errors).length) return response.status(400).json({ error: "Check the highlighted fields.", errors });
    const id = randomUUID();
    try {
      database.prepare(`
        INSERT INTO skills (id, user_id, kind, name, normalized_name, category, experience_level, description, instruction_language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, request.user.id, kind, values.name, values.normalizedName, values.category, values.experienceLevel, values.description, values.instructionLanguage);
      const row = database.prepare(`
        SELECT id, kind, name, category, experience_level, description, instruction_language, created_at, updated_at FROM skills WHERE id = ?
      `).get(id);
      return response.status(201).json({ skill: publicSkill(row) });
    } catch (error) {
      if (/UNIQUE constraint failed: skills\.user_id, skills\.kind, skills\.normalized_name/i.test(error.message)) {
        return response.status(409).json({ error: "You already have this skill in this list.", errors: { name: "This skill is already on your list." } });
      }
      return next(error);
    }
  });

  router.put("/skills/:id", (request, response, next) => {
    const { errors, values } = skillInput(isPlainObject(request.body) ? request.body : {});
    if (Object.keys(errors).length) return response.status(400).json({ error: "Check the highlighted fields.", errors });
    try {
      const result = database.prepare(`
        UPDATE skills SET name = ?, normalized_name = ?, category = ?, experience_level = ?, instruction_language = ?,
          description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(values.name, values.normalizedName, values.category, values.experienceLevel, values.instructionLanguage, values.description, request.params.id, request.user.id);
      if (result.changes === 0) return response.status(404).json({ error: "Skill not found." });
      const row = database.prepare(`
        SELECT id, kind, name, category, experience_level, description, instruction_language, created_at, updated_at FROM skills WHERE id = ? AND user_id = ?
      `).get(request.params.id, request.user.id);
      return response.json({ skill: publicSkill(row) });
    } catch (error) {
      if (/UNIQUE constraint failed: skills\.user_id, skills\.kind, skills\.normalized_name/i.test(error.message)) {
        return response.status(409).json({ error: "You already have this skill in this list.", errors: { name: "This skill is already on your list." } });
      }
      return next(error);
    }
  });

  router.delete("/skills/:id", (request, response, next) => {
    try {
      const result = database.prepare("DELETE FROM skills WHERE id = ? AND user_id = ?").run(request.params.id, request.user.id);
      if (result.changes === 0) return response.status(404).json({ error: "Skill not found." });
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
