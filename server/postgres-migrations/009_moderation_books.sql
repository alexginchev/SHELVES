ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check CHECK(target_kind IN ('post','comment','reader','list_comment'));
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
