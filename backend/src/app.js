import express from "express";
import { createAuthRouter } from "./auth.js";
import { avatarDirectory, createProfileSkillsRouter } from "./profile-skills.js";
import { createExploreRouter, createPublicProfilesRouter } from "./explore.js";
import { createReviewsRouter } from "./reviews.js";
import { createMessagingRouter } from "./messaging.js";
import { createLearningSessionsRouter } from "./learning-sessions.js";
import { createOpenLearningRoomsRouter } from "./open-learning-rooms.js";
import { createMeetingCollaborationRouter } from "./meeting-collaboration.js";
import { createModerationRouter } from "./admin.js";
import { createStudentRankingsRouter } from "./student-rankings.js";
import { createMeetingTicketsRouter } from "./meeting-tickets.js";
import { createNotificationsRouter } from "./notifications.js";
import { getConfiguredOrigins, isDevelopmentFrontendOrigin } from "./origin-policy.js";
import { createCareerRoadmapsRouter } from "./career-roadmaps.js";

export function createApp(database, options = {}) {
  const app = express();
  app.disable("x-powered-by");
  const configuredOrigins = getConfiguredOrigins();
  const defaultOrigins = process.env.NODE_ENV === "production"
    ? ["https://swapskil1.vercel.app", "https://swapskil1-2uc5.vercel.app"]
    : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"];
  const allowedOrigins = new Set(options.allowedOrigins ?? [...defaultOrigins, ...configuredOrigins]);
  const configuredRateLimit = Number.parseInt(process.env.AUTH_RATE_LIMIT || "10", 10);
  const configuredSessionHours = Number.parseInt(process.env.SESSION_TTL_HOURS || "720", 10);
  const rateLimitCount = options.rateLimitCount ?? (
    Number.isInteger(configuredRateLimit) && configuredRateLimit > 0 ? configuredRateLimit : 10
  );
  const sessionTtlMs = options.sessionTtlMs ?? (
    Number.isInteger(configuredSessionHours) && configuredSessionHours > 0 && configuredSessionHours <= 720
      ? configuredSessionHours
      : 168
  ) * 60 * 60 * 1000;
  app.locals.cookieSecure = options.cookieSecure ?? (
    process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true"
  );
  app.locals.sessionTtlMs = sessionTtlMs;

  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");

    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    const origin = request.get("Origin");
    if (isMutation && origin) {
      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        return response.status(403).json({ error: "Request origin is not allowed." });
      }

      const sameOrigin = origin === `${request.protocol}://${request.get("host")}`;
      if (!allowedOrigins.has(origin) && !sameOrigin && !isDevelopmentFrontendOrigin(origin)) {
        return response.status(403).json({ error: "Request origin is not allowed." });
      }
      if (parsedOrigin.origin !== origin) {
        return response.status(403).json({ error: "Request origin is not allowed." });
      }
    }
    return next();
  });

  app.use(express.json({ limit: "10kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/public", createPublicProfilesRouter(database, avatarDirectory));

  app.use("/api/auth", createAuthRouter(database, {
    cookieSecure: app.locals.cookieSecure,
    sessionTtlMs,
    rateLimitCount,
  }));

  // Keep authenticated routers after /api/auth. Their router-wide auth
  // middleware would otherwise intercept unauthenticated login requests.
  app.use("/api", createStudentRankingsRouter(database));
  app.use("/api", createCareerRoadmapsRouter(database));
  app.use("/api", createProfileSkillsRouter(database));
  app.use("/api", createExploreRouter(database));
  app.use("/api", createReviewsRouter(database));
  app.use("/api", createLearningSessionsRouter(database));
  app.use("/api", createMeetingTicketsRouter(database));
  app.use("/api", createOpenLearningRoomsRouter(database));
  app.use("/api", createMeetingCollaborationRouter(database));
  app.use("/api", createMessagingRouter(database, options.messaging));
  app.use("/api", createNotificationsRouter(database));
  app.use("/api", createModerationRouter(database));

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found." });
  });

  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === "entity.parse.failed") {
      return response.status(400).json({ error: "Request body must be valid JSON." });
    }
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: "Request body is too large." });
    }
    console.error("Unhandled API error:", error);
    return response.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again." });
  });

  return app;
}
