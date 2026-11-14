CREATE TABLE book_metadata (
 book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
 details TEXT NOT NULL
);
CREATE TABLE book_authors (
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 PRIMARY KEY (book_id,name)
);
CREATE INDEX book_authors_name ON book_authors(name,book_id);
