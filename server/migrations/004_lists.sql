CREATE TABLE lists (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX lists_owner ON lists(user_id,updated_at DESC);
CREATE INDEX lists_public ON lists(updated_at DESC) WHERE visibility='public';
CREATE TABLE list_books (
 list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 position INTEGER NOT NULL CHECK(position >= 0),
 PRIMARY KEY(list_id,book_id),
 UNIQUE(list_id,position)
);
CREATE INDEX list_books_book ON list_books(book_id);
