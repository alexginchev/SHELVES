CREATE TABLE list_comments (
 id TEXT PRIMARY KEY,
 list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX list_comments_page ON list_comments(list_id,created_at,id);
CREATE INDEX list_comments_user ON list_comments(user_id);
