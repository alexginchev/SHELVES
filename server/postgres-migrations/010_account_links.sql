ALTER TABLE users ADD COLUMN email_verified_at BIGINT;
UPDATE users SET email_verified_at = 1;
CREATE TABLE account_links (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 issued_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL
);
CREATE INDEX account_links_user_purpose ON account_links(user_id,purpose);
