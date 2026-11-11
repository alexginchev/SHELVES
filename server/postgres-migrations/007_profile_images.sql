CREATE TABLE profile_images (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('avatar','banner')),
 image TEXT NOT NULL,
 version TEXT NOT NULL,
 PRIMARY KEY(user_id,kind)
);
