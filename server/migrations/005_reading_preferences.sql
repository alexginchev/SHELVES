CREATE TABLE reading_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 genres TEXT NOT NULL DEFAULT '[]'
);
