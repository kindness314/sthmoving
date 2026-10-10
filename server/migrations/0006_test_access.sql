-- 审核沙箱入口口令（控制面，只由生产库读写）。
-- 口令只存 sha256 哈希，明文仅在生成时返回一次；关闭或过期即失效。
CREATE TABLE test_access (
  id text PRIMARY KEY COLLATE "C",
  password_hash text NOT NULL COLLATE "C",
  password_salt text NOT NULL COLLATE "C",
  created_by text COLLATE "C" REFERENCES users (id),
  created_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  revoked_at timestamptz(3),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at timestamptz(3)
);

CREATE INDEX test_access_active ON test_access (expires_at DESC)
  WHERE revoked_at IS NULL;
