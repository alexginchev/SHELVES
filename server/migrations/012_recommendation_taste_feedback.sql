CREATE TABLE recommendation_taste_feedback (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 book_id TEXT NOT NULL REFERENCES books(id),
 signal TEXT NOT NULL CHECK(signal IN ('more','less')),
 PRIMARY KEY(user_id,book_id)
);
