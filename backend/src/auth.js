import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { verifyGoogleCredential } from "./google-identity.js";

export const SESSION_COOKIE_NAME = "skillswap.sid";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authRefreshes = new Map();
const SESSION_SELECT = `
  SELECT u.id, u.full_name, u.email, u.role, u.created_at, s.token_hash,
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id AND p.profile_completed_at IS NOT NULL) AS profile_complete
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
`;

function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    ...(row.profile_complete === undefined ? {} : { profileComplete: Boolean(row.profile_complete) }),
  };
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function readSessionToken(request) {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : null;
}

function cookieOptions(secure, maxAgeSeconds) {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function setSessionCookie(response, token, secure, maxAgeSeconds) {
  response.setHeader("Set-Cookie", cookieOptions(secure, maxAgeSeconds).replace(
    `${SESSION_COOKIE_NAME}=;`,
    `${SESSION_COOKIE_NAME}=${token};`,
  ));
}

function clearSessionCookie(response, secure) {
  response.setHeader("Set-Cookie", cookieOptions(secure, 0));
}

function createSession(database, userId, lifetimeMs) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = Date.now();
  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), userId, createdAt, createdAt + lifetimeMs);
  return token;
}

function registerErrors(body) {
  const errors = {};
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!fullName) errors.fullName = "Enter your full name.";
  else if (Array.from(fullName).length > 100) errors.fullName = "Use 100 characters or fewer.";

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  const passwordLength = Array.from(password).length;
  if (!password) errors.password = "Enter a password.";
  else if (passwordLength < 12) errors.password = "Use at least 12 characters.";
  else if (passwordLength > 128) errors.password = "Use 128 characters or fewer.";

  if (!confirmPassword) errors.confirmPassword = "Confirm your password.";
  else if (password !== confirmPassword) errors.confirmPassword = "The passwords do not match.";

  if (Object.hasOwn(body, "role")) errors.role = "A role cannot be selected during public registration.";

  return { errors, values: { fullName, email, password } };
}

function loginErrors(body) {
  const errors = {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  else if (Array.from(password).length > 128) errors.password = "Use 128 characters or fewer.";

  return { errors, values: { email, password } };
}

function createLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: "Too many attempts. Please wait and try again." });
    },
  });
}

export function requireAuth(database) {
  return (request, response, next) => {
    try {
      const authenticated = authenticateRequest(database, request);
      if (!authenticated) {
        clearSessionCookie(response, request.app.locals.cookieSecure);
        return response.status(401).json({ error: "Authentication required." });
      }
      // Keep active learners signed in. Refresh both the server-side expiry and
      // the browser cookie so closing the tab does not end their session.
      const sessionTtlMs = request.app.locals.sessionTtlMs || 30 * 24 * 60 * 60 * 1000;
      const token = readSessionToken(request);
      // Authenticated pages can make several API requests at once. Refreshing
      // the session and activity on every request added two serial Postgres
      // round trips each time. Once per minute is enough to keep active
      // sessions persistent and activity current.
      const now = Date.now();
      const lastRefresh = authRefreshes.get(authenticated.tokenHash) || 0;
      if (now - lastRefresh >= 60_000) {
        database.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
          .run(now + sessionTtlMs, authenticated.tokenHash);
        database.prepare("UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ? AND (last_active_at IS NULL OR last_active_at < datetime('now', '-1 minute'))")
          .run(authenticated.user.id);
        authRefreshes.set(authenticated.tokenHash, now);
        if (authRefreshes.size > 5_000) {
          for (const [tokenHash, refreshedAt] of authRefreshes) {
            if (now - refreshedAt > sessionTtlMs) authRefreshes.delete(tokenHash);
          }
        }
      }
      setSessionCookie(response, token, request.app.locals.cookieSecure, Math.floor(sessionTtlMs / 1000));
      request.user = authenticated.user;
      request.sessionTokenHash = authenticated.tokenHash;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function authenticateRequest(database, request) {
  const token = readSessionToken(request);
  if (!token) return null;
  const session = database.prepare(SESSION_SELECT).get(hashToken(token), Date.now());
  return session ? { user: publicUser(session), tokenHash: session.token_hash } : null;
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user) return response.status(401).json({ error: "Authentication required." });
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: "You do not have permission to access this resource." });
    }
    return next();
  };
}

export function createAuthRouter(database, {
  cookieSecure = false,
  sessionTtlMs = 7 * 24 * 60 * 60 * 1000,
  rateLimitCount = 10,
  googleClientId = process.env.GOOGLE_CLIENT_ID || "",
} = {}) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post("/register", createLimiter(rateLimitCount), async (request, response) => {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
      ? request.body
      : {};
    const { errors, values } = registerErrors(body);
    if (Object.keys(errors).length) {
      return response.status(400).json({ error: "Check the highlighted fields.", errors });
    }

    const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(values.email);
    if (existing) {
      return response.status(409).json({ error: "An account with this email already exists.", errors: { email: "This email is already registered." } });
    }

    const passwordHash = await argon2.hash(values.password, { type: argon2.argon2id });
    const userId = randomUUID();
    let token;
    try {
      database.exec("BEGIN IMMEDIATE;");
      database.prepare(`
        INSERT INTO users (id, full_name, email, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(userId, values.fullName, values.email, passwordHash);
      token = createSession(database, userId, sessionTtlMs);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      if (/UNIQUE constraint failed: users\.email/i.test(error.message)) {
        return response.status(409).json({ error: "An account with this email already exists.", errors: { email: "This email is already registered." } });
      }
      throw error;
    }

    setSessionCookie(response, token, cookieSecure, Math.floor(sessionTtlMs / 1000));
    const user = database.prepare("SELECT id, full_name, email, role, created_at FROM users WHERE id = ?").get(userId);
    return response.status(201).json({ user: publicUser(user) });
  });

  router.post("/login", createLimiter(rateLimitCount), async (request, response) => {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
      ? request.body
      : {};
    const { errors, values } = loginErrors(body);
    if (Object.keys(errors).length) {
      return response.status(400).json({ error: "Check the highlighted fields.", errors });
    }

    const user = database.prepare("SELECT id, full_name, email, role, created_at, password_hash FROM users WHERE email = ? AND status = 'active'").get(values.email);
    const passwordMatches = user
      ? await argon2.verify(user.password_hash, values.password)
      : (await argon2.hash(values.password, { type: argon2.argon2id }), false);

    if (!user || !passwordMatches) {
      return response.status(401).json({ error: "Invalid email or password." });
    }

    const token = createSession(database, user.id, sessionTtlMs);
    setSessionCookie(response, token, cookieSecure, Math.floor(sessionTtlMs / 1000));
    return response.json({ user: publicUser(user) });
  });

  router.post("/google", createLimiter(rateLimitCount), async (request, response, next) => {
    if (!googleClientId) return response.status(503).json({ error: "Google sign-in is not configured yet." });
    const credential = request.body?.credential;
    let identity;
    try {
      identity = await verifyGoogleCredential(credential, googleClientId);
    } catch (error) {
      const unavailable = error instanceof TypeError || error?.name === "TimeoutError" || /verification keys are unavailable/i.test(error?.message || "");
      return response.status(unavailable ? 503 : 401).json({
        error: unavailable ? "Google sign-in is temporarily unavailable. Please try again." : "Google sign-in could not be verified. Please try again.",
      });
    }

    let transactionOpen = false;
    try {
      database.exec("BEGIN IMMEDIATE;");
      transactionOpen = true;

      let user = database.prepare(`SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at
        FROM google_accounts g JOIN users u ON u.id = g.user_id WHERE g.subject = ?`).get(identity.subject);

      if (user && user.status !== "active") {
        database.exec("ROLLBACK;"); transactionOpen = false;
        return response.status(403).json({ error: "This account is not available. Contact SkillSwap support." });
      }

      if (!user) {
        user = database.prepare("SELECT id, full_name, email, role, status, created_at FROM users WHERE email = ?").get(identity.email);
        if (user && user.status !== "active") {
          database.exec("ROLLBACK;"); transactionOpen = false;
          return response.status(403).json({ error: "This account is not available. Contact SkillSwap support." });
        }

        if (user) {
          const emailDomain = identity.email.split("@")[1];
          const googleAuthoritativelyOwnsEmail = emailDomain === "gmail.com" || Boolean(identity.hostedDomain && emailDomain === identity.hostedDomain);
          if (!googleAuthoritativelyOwnsEmail) {
            database.exec("ROLLBACK;"); transactionOpen = false;
            return response.status(409).json({ error: "This email already has an account. Sign in with its password first." });
          }
          database.prepare("INSERT INTO google_accounts (subject, user_id) VALUES (?, ?)").run(identity.subject, user.id);
        } else {
          const userId = randomUUID();
          const unusablePasswordHash = await argon2.hash(randomBytes(32).toString("base64url"), { type: argon2.argon2id });
          database.prepare("INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)")
            .run(userId, identity.fullName, identity.email, unusablePasswordHash);
          database.prepare("INSERT INTO google_accounts (subject, user_id) VALUES (?, ?)").run(identity.subject, userId);
          user = database.prepare("SELECT id, full_name, email, role, status, created_at FROM users WHERE id = ?").get(userId);
        }
      }

      const token = createSession(database, user.id, sessionTtlMs);
      database.exec("COMMIT;"); transactionOpen = false;
      setSessionCookie(response, token, cookieSecure, Math.floor(sessionTtlMs / 1000));
      return response.json({ user: publicUser(user) });
    } catch (error) {
      if (transactionOpen) {
        try { database.exec("ROLLBACK;"); } catch { /* transaction already rolled back */ }
      }
      if (/UNIQUE constraint failed: google_accounts\.(subject|user_id)/i.test(error.message)) {
        return response.status(409).json({ error: "This Google account is already linked to another SkillSwap account." });
      }
      return next(error);
    }
  });

  router.post("/logout", (request, response, next) => {
    try {
      const token = readSessionToken(request);
      if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      clearSessionCookie(response, cookieSecure);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.get("/me", requireAuth(database), (request, response) => {
    response.json({ user: request.user });
  });

  return router;
}
