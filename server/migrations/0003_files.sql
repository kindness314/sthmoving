CREATE TABLE files (
  path text PRIMARY KEY COLLATE "C",
  purpose text NOT NULL CHECK (purpose IN ('ITEM_IMAGE', 'AVATAR', 'LABEL')),
  owner_id text COLLATE "C",
  content_type text NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz(3) NOT NULL
);

CREATE INDEX files_owner_id ON files (owner_id);
CREATE INDEX files_purpose_created_at ON files (purpose, created_at DESC);
