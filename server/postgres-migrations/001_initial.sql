CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, username TEXT NOT NULL,
 display_name TEXT NOT NULL, password_hash TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '',
 goal INTEGER NOT NULL DEFAULT 30 CHECK(goal BETWEEN 1 AND 500), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users(lower(email));
CREATE UNIQUE INDEX users_username_unique ON users(lower(username));
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE books(id TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT NOT NULL,genre TEXT NOT NULL,pages INTEGER CHECK(pages IS NULL OR pages>0),description TEXT NOT NULL DEFAULT '',cover TEXT,color TEXT NOT NULL DEFAULT 'sage',year INTEGER);
CREATE TABLE reading(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,book_id TEXT NOT NULL REFERENCES books(id),status TEXT NOT NULL CHECK(status IN ('Want to read','Currently reading','Finished','Did not finish')),page INTEGER NOT NULL DEFAULT 0 CHECK(page>=0),rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 5),review TEXT NOT NULL DEFAULT '',finished_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,book_id));
CREATE TABLE shelves(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL);
CREATE UNIQUE INDEX shelves_name_unique ON shelves(user_id,lower(name));
CREATE TABLE shelf_books(shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,book_id TEXT NOT NULL REFERENCES books(id),PRIMARY KEY(shelf_id,book_id));
CREATE TABLE recommendation_feedback(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,book_id TEXT NOT NULL REFERENCES books(id),PRIMARY KEY(user_id,book_id));
CREATE TABLE posts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('thought','quote','review','progress')),book_id TEXT REFERENCES books(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 5),contains_spoilers INTEGER NOT NULL DEFAULT 0 CHECK(contains_spoilers IN (0,1)),edited_at TIMESTAMPTZ);
CREATE INDEX posts_created ON posts(created_at DESC);
CREATE INDEX posts_user_created ON posts(user_id,created_at DESC);
CREATE UNIQUE INDEX one_review_per_book ON posts(user_id,book_id) WHERE kind='review' AND book_id IS NOT NULL;
CREATE INDEX reviews_book_created ON posts(book_id,created_at DESC) WHERE kind='review';
CREATE TABLE post_likes(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,PRIMARY KEY(user_id,post_id));
CREATE INDEX likes_post ON post_likes(post_id);
CREATE TABLE comments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX comments_post ON comments(post_id,created_at);
CREATE TABLE follows(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,followed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,CHECK(user_id!=followed_id),PRIMARY KEY(user_id,followed_id));
CREATE INDEX follows_target ON follows(followed_id);
CREATE TABLE sqlite_imports(source_hash TEXT PRIMARY KEY,counts JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
