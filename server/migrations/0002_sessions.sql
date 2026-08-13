CREATE TABLE sessions (
  id text PRIMARY KEY COLLATE "C",
  token_hash text NOT NULL UNIQUE COLLATE "C",
  user_id text NOT NULL COLLATE "C" REFERENCES users (id),
  created_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);
CREATE INDEX sessions_expires_at ON sessions (expires_at);
