import { Router } from "express";
import { requireAuth } from "./auth.js";

export function createStudentRankingsRouter(database) {
  const router = Router();
  router.use(requireAuth(database));

  router.get("/student-rankings", (_req, res) => {
    const rows = database.prepare(`
      WITH finished_activity AS (
        SELECT p.user_id, COUNT(DISTINCT s.id) AS completed_count
        FROM learning_session_participants p
        JOIN learning_sessions s ON s.id = p.session_id
        WHERE s.status = 'completed' AND s.cancelled_at IS NULL
        GROUP BY p.user_id
        UNION ALL
        SELECT p.user_id, COUNT(*) AS completed_count
        FROM open_learning_room_participants p
        JOIN open_learning_rooms r ON r.id = p.room_id
        WHERE r.status = 'closed'
        GROUP BY p.user_id
      ), activity AS (
        SELECT user_id, SUM(completed_count) AS completed_sessions
        FROM finished_activity GROUP BY user_id
      ), eligible_reviews AS (
        SELECT r.recipient_id, r.rating_type, r.stars
        FROM session_reviews r JOIN learning_sessions s ON s.id = r.session_id
        WHERE s.status = 'completed' AND s.cancelled_at IS NULL
        UNION ALL
        SELECT r.recipient_id, r.rating_type, r.stars
        FROM open_room_reviews r JOIN open_learning_rooms room ON room.id = r.room_id
        WHERE room.status = 'closed'
      ), ratings AS (
        SELECT recipient_id,
          ROUND(AVG(CASE WHEN rating_type = 'teacher' THEN stars END), 1) AS teacher_rating,
          COUNT(CASE WHEN rating_type = 'teacher' THEN 1 END) AS teacher_reviews,
          ROUND(AVG(CASE WHEN rating_type = 'learner' THEN stars END), 1) AS learner_rating,
          COUNT(CASE WHEN rating_type = 'learner' THEN 1 END) AS learner_reviews
        FROM eligible_reviews GROUP BY recipient_id
      )
      SELECT u.id, u.full_name AS fullName, p.avatar_url AS avatarUrl, p.bio,
        activity.completed_sessions AS completedSessions,
        ratings.teacher_rating AS teacherRating, COALESCE(ratings.teacher_reviews, 0) AS teacherReviews,
        ratings.learner_rating AS learnerRating, COALESCE(ratings.learner_reviews, 0) AS learnerReviews
      FROM activity
      JOIN users u ON u.id = activity.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      JOIN ratings ON ratings.recipient_id = u.id
      WHERE u.role = 'user' AND u.status = 'active' AND activity.completed_sessions > 0
        AND (COALESCE(ratings.teacher_reviews, 0) + COALESCE(ratings.learner_reviews, 0)) > 0
      ORDER BY activity.completed_sessions DESC,
        CASE WHEN ratings.teacher_rating IS NULL THEN 1 ELSE 0 END,
        ratings.teacher_rating DESC,
        CASE WHEN ratings.learner_rating IS NULL THEN 1 ELSE 0 END,
        ratings.learner_rating DESC,
        lower(u.full_name), u.id
      LIMIT 100
    `).all();

    return res.json({ students: rows.map((row, index) => ({ ...row, rank: index + 1 })) });
  });

  return router;
}
