ALTER TABLE posts ADD COLUMN rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 5);
ALTER TABLE posts ADD COLUMN contains_spoilers INTEGER NOT NULL DEFAULT 0 CHECK(contains_spoilers IN (0,1));
ALTER TABLE posts ADD COLUMN edited_at TEXT;
CREATE UNIQUE INDEX one_review_per_book ON posts(user_id,book_id) WHERE kind='review' AND book_id IS NOT NULL;
CREATE INDEX reviews_book_created ON posts(book_id,created_at DESC) WHERE kind='review';
