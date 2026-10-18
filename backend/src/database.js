import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_VERSION = 13;

export function openDatabase(
  configuredPath = process.env.SQLITE_DB_PATH || "../database/skillswap.sqlite",
) {
  const databasePath = configuredPath === ":memory:"
    ? configuredPath
    : isAbsolute(configuredPath)
      ? configuredPath
      : resolve(backendDirectory, configuredPath);

  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath, { open: true, timeout: 5000 });
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

/** Apply additive, versioned schema changes. Existing user data is preserved. */
export function migrateDatabase(database) {
  const currentVersion = database.prepare("PRAGMA user_version").get().user_version;
  if (currentVersion > DATABASE_VERSION) {
    throw new Error(`Database version ${currentVersion} is newer than this application supports.`);
  }
  if (currentVersion === DATABASE_VERSION) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      PRAGMA user_version = 1;
    `);
    if (currentVersion < 2) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
          institution TEXT NOT NULL DEFAULT '' CHECK (length(institution) <= 150),
          department TEXT NOT NULL DEFAULT '' CHECK (length(department) <= 100),
          location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 100),
          interests TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('teach', 'learn')),
          name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
          normalized_name TEXT NOT NULL,
          category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 60),
          experience_level TEXT NOT NULL CHECK (experience_level IN ('Beginner', 'Intermediate', 'Advanced')),
          description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 300),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, kind, normalized_name)
        );

        CREATE INDEX IF NOT EXISTS idx_skills_user_kind ON skills(user_id, kind);
        CREATE INDEX IF NOT EXISTS idx_skills_discovery ON skills(kind, normalized_name, category, experience_level);
        PRAGMA user_version = 2;
      `);
    }
    if (currentVersion < 3) {
      database.exec(`
        ALTER TABLE profiles ADD COLUMN learning_skills_public INTEGER NOT NULL DEFAULT 0 CHECK (learning_skills_public IN (0, 1));

        CREATE TABLE IF NOT EXISTS exchange_requests (
          id TEXT PRIMARY KEY,
          sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (sender_user_id <> recipient_user_id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_requests_active
          ON exchange_requests(sender_user_id, recipient_user_id, skill_id)
          WHERE status IN ('pending', 'accepted');
        CREATE INDEX IF NOT EXISTS idx_exchange_requests_recipient_status
          ON exchange_requests(recipient_user_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_exchange_requests_sender_status
          ON exchange_requests(sender_user_id, status, created_at);
        PRAGMA user_version = 3;
      `);
    }
    if (currentVersion < 4) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS learning_sessions (
          id TEXT PRIMARY KEY,
          exchange_request_id TEXT NOT NULL UNIQUE REFERENCES exchange_requests(id) ON DELETE CASCADE,
          teacher_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          learner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          skill_name TEXT NOT NULL CHECK (length(skill_name) BETWEEN 1 AND 120),
          status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed')),
          teacher_confirmed_at TEXT,
          learner_confirmed_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT,
          CHECK (teacher_user_id <> learner_user_id),
          CHECK ((status = 'scheduled' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL))
        );

        CREATE INDEX IF NOT EXISTS idx_learning_sessions_teacher_status ON learning_sessions(teacher_user_id, status);
        CREATE INDEX IF NOT EXISTS idx_learning_sessions_learner_status ON learning_sessions(learner_user_id, status);

        CREATE TABLE IF NOT EXISTS session_reviews (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
          reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating_type TEXT NOT NULL CHECK (rating_type IN ('teacher', 'learner')),
          stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
          review_text TEXT NOT NULL DEFAULT '' CHECK (length(review_text) <= 1000),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (reviewer_id <> recipient_id),
          UNIQUE (session_id, reviewer_id, rating_type)
        );

        CREATE INDEX IF NOT EXISTS idx_session_reviews_recipient_type ON session_reviews(recipient_id, rating_type, created_at);
        CREATE INDEX IF NOT EXISTS idx_session_reviews_session ON session_reviews(session_id);
        PRAGMA user_version = 4;
      `);
    }
    if (currentVersion < 5) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
          direct_key TEXT UNIQUE,
          group_name TEXT CHECK (group_name IS NULL OR length(group_name) BETWEEN 1 AND 80),
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK ((kind = 'direct' AND direct_key IS NOT NULL AND group_name IS NULL) OR
                 (kind = 'group' AND direct_key IS NULL AND group_name IS NOT NULL))
        );

        CREATE TABLE IF NOT EXISTS conversation_members (
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          left_at TEXT,
          last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (conversation_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_conversation_members_user_active
          ON conversation_members(user_id, left_at, conversation_id);

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
          ON messages(conversation_id, created_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS message_attachments (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
          storage_key TEXT NOT NULL UNIQUE,
          extension TEXT NOT NULL CHECK (extension IN ('png','jpg','webp','pdf','txt','mp4','webm')),
          original_name TEXT NOT NULL CHECK (length(original_name) BETWEEN 1 AND 180),
          content_type TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','application/pdf','text/plain','video/mp4','video/webm')),
          byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_message ON message_attachments(message_id);
        PRAGMA user_version = 5;
      `);
    }
    if (currentVersion < 6) {
      database.exec(`
        ALTER TABLE learning_sessions ADD COLUMN title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 120);
        ALTER TABLE learning_sessions ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000);
        ALTER TABLE learning_sessions ADD COLUMN scheduled_at TEXT;
        ALTER TABLE learning_sessions ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 240);
        ALTER TABLE learning_sessions ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE learning_sessions ADD COLUMN cancelled_at TEXT;
        UPDATE learning_sessions SET title = skill_name WHERE title = '';

        CREATE TABLE IF NOT EXISTS learning_session_participants (
          session_id TEXT NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('teacher', 'learner')),
          joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (session_id, user_id),
          UNIQUE (session_id, role)
        );
        INSERT OR IGNORE INTO learning_session_participants (session_id, user_id, role)
          SELECT id, teacher_user_id, 'teacher' FROM learning_sessions;
        INSERT OR IGNORE INTO learning_session_participants (session_id, user_id, role)
          SELECT id, learner_user_id, 'learner' FROM learning_sessions;
        CREATE INDEX IF NOT EXISTS idx_learning_session_participants_user ON learning_session_participants(user_id, session_id);
        CREATE INDEX IF NOT EXISTS idx_learning_sessions_schedule ON learning_sessions(scheduled_at, cancelled_at);
        PRAGMA user_version = 6;
      `);
    }
    if (currentVersion < 7) {
      database.exec(`
        ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed'));
        ALTER TABLE users ADD COLUMN suspended_at TEXT;
        ALTER TABLE users ADD COLUMN suspension_reason TEXT;
        ALTER TABLE users ADD COLUMN removed_at TEXT;
        ALTER TABLE users ADD COLUMN removal_reason TEXT;

        CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status, role, created_at);
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          target_type TEXT NOT NULL CHECK (target_type IN ('profile','message')),
          target_id TEXT NOT NULL,
          reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 1000),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','resolved','dismissed')),
          moderation_notes TEXT NOT NULL DEFAULT '' CHECK (length(moderation_notes) <= 2000),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_reports_reporter_created ON reports(reporter_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id TEXT PRIMARY KEY,
          admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
          target_type TEXT NOT NULL CHECK (length(target_type) BETWEEN 1 AND 50),
          target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 100),
          reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
          details TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC, id);
        PRAGMA user_version = 7;
      `);
    }
    if (currentVersion < 8) {
      database.exec(`
        CREATE TABLE learning_session_participants_v8 (
          session_id TEXT NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('teacher', 'learner')),
          joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (session_id, user_id)
        );
        INSERT INTO learning_session_participants_v8 (session_id, user_id, role, joined_at)
          SELECT session_id, user_id, role, joined_at FROM learning_session_participants;
        DROP TABLE learning_session_participants;
        ALTER TABLE learning_session_participants_v8 RENAME TO learning_session_participants;
        CREATE INDEX idx_learning_session_participants_user ON learning_session_participants(user_id, session_id);
        PRAGMA user_version = 8;
      `);
    }
    if (currentVersion < 9) {
      database.exec(`
        CREATE TABLE open_learning_rooms (
          id TEXT PRIMARY KEY,
          creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
          skill_name TEXT NOT NULL CHECK (length(skill_name) BETWEEN 1 AND 80),
          title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
          description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
          starts_at TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 15 AND 240),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          closed_at TEXT
        );
        CREATE INDEX idx_open_learning_rooms_status_start ON open_learning_rooms(status, starts_at);
        CREATE INDEX idx_open_learning_rooms_creator ON open_learning_rooms(creator_id, created_at DESC);

        CREATE TABLE open_learning_room_participants (
          room_id TEXT NOT NULL REFERENCES open_learning_rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('teacher','learner')),
          joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          left_at TEXT,
          PRIMARY KEY (room_id, user_id)
        );
        CREATE INDEX idx_open_room_participants_user ON open_learning_room_participants(user_id, room_id);
        CREATE INDEX idx_open_room_participants_active ON open_learning_room_participants(room_id, left_at);
        PRAGMA user_version = 9;
      `);
    }
    if (currentVersion < 10) {
      database.exec(`
        ALTER TABLE profiles ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '' CHECK (length(avatar_url) <= 240);
        ALTER TABLE skills ADD COLUMN instruction_language TEXT NOT NULL DEFAULT 'English' CHECK (length(instruction_language) BETWEEN 1 AND 40);

        WITH ranked_pending AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY sender_user_id, recipient_user_id ORDER BY created_at, id) AS position
          FROM exchange_requests WHERE status = 'pending'
        )
        UPDATE exchange_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT id FROM ranked_pending WHERE position > 1);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_requests_one_pending_pair
          ON exchange_requests(sender_user_id, recipient_user_id) WHERE status = 'pending';

        CREATE TABLE IF NOT EXISTS email_notification_queue (
          id TEXT PRIMARY KEY,
          recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          notification_type TEXT NOT NULL CHECK (notification_type IN ('exchange_request','session_reminder')),
          reference_id TEXT NOT NULL,
          schedule_key TEXT NOT NULL DEFAULT '',
          payload TEXT NOT NULL DEFAULT '{}',
          attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
          last_error TEXT NOT NULL DEFAULT '' CHECK (length(last_error) <= 500),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT,
          UNIQUE (recipient_user_id, notification_type, reference_id, schedule_key)
        );
        CREATE INDEX IF NOT EXISTS idx_email_notification_pending ON email_notification_queue(sent_at, attempts, created_at);
        PRAGMA user_version = 10;
      `);
    }
    if (currentVersion < 11) {
      database.exec(`
        CREATE TABLE meeting_chat_messages (
          id TEXT PRIMARY KEY,
          room_type TEXT NOT NULL CHECK (room_type IN ('session','open-room')),
          room_id TEXT NOT NULL,
          sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_meeting_chat_history ON meeting_chat_messages(room_type, room_id, id DESC);
        CREATE TABLE meeting_notes (
          room_type TEXT NOT NULL CHECK (room_type IN ('session','open-room')),
          room_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 10000),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_type, room_id, user_id)
        );
        PRAGMA user_version = 11;
      `);
    }
    if (currentVersion < 12) {
      database.exec(`
        CREATE TABLE open_room_reviews (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL REFERENCES open_learning_rooms(id) ON DELETE CASCADE,
          reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating_type TEXT NOT NULL CHECK (rating_type IN ('teacher','learner')),
          stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
          review_text TEXT NOT NULL DEFAULT '' CHECK (length(review_text) <= 1000),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (reviewer_id <> recipient_id),
          UNIQUE (room_id, reviewer_id, recipient_id)
        );
        CREATE INDEX idx_open_room_reviews_recipient_type ON open_room_reviews(recipient_id, rating_type, created_at);
        CREATE INDEX idx_open_room_reviews_room ON open_room_reviews(room_id);
        PRAGMA user_version = 12;
      `);
    }
    if (currentVersion < 13) {
      database.exec(`
        CREATE TABLE google_accounts (
          subject TEXT PRIMARY KEY CHECK (length(subject) BETWEEN 1 AND 255),
          user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_google_accounts_user ON google_accounts(user_id);
        PRAGMA user_version = 13;
      `);
    }
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}

export function initializeDatabase(configuredPath) {
  const database = openDatabase(configuredPath);
  migrateDatabase(database);
  return database;
}
