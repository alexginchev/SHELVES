CREATE TABLE reader_controls (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('block','mute')),
 PRIMARY KEY(user_id,target_id,kind),
 CHECK(user_id<>target_id)
);
CREATE INDEX reader_controls_target ON reader_controls(target_id,kind);
CREATE TABLE reports (
 id TEXT PRIMARY KEY,
 reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('post','comment','reader')),
 target_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','removed')),
 created_at TEXT NOT NULL,
 resolved_at TEXT,
 resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(reporter_id,target_kind,target_id)
);
CREATE INDEX reports_queue ON reports(status,created_at);
