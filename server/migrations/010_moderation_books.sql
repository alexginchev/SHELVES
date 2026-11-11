ALTER TABLE reports RENAME TO reports_old;
CREATE TABLE reports (
 id TEXT PRIMARY KEY,
 reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('post','comment','reader','list_comment')),
 target_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','removed')),
 created_at TEXT NOT NULL,
 resolved_at TEXT,
 resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(reporter_id,target_kind,target_id)
);
INSERT INTO reports SELECT * FROM reports_old;
DROP TABLE reports_old;
CREATE INDEX reports_queue ON reports(status,created_at);
CREATE TABLE account_suspensions (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE moderation_actions (
 id TEXT PRIMARY KEY,
 target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 target_name TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('suspend','restore')),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX moderation_actions_target ON moderation_actions(target_id,created_at);
CREATE TABLE book_search_cache (
 query TEXT PRIMARY KEY,
 items TEXT NOT NULL,
 fetched_at BIGINT NOT NULL
);
