CREATE TABLE notifications (
 id TEXT PRIMARY KEY,
 recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('like','comment','follow')),
 post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
 comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 read_at TEXT,
 CHECK (recipient_id != actor_id)
);
CREATE INDEX notifications_recipient ON notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread ON notifications(recipient_id) WHERE read_at IS NULL;
CREATE INDEX notifications_actor ON notifications(actor_id);
CREATE INDEX notifications_post ON notifications(post_id);
CREATE INDEX notifications_comment ON notifications(comment_id);
