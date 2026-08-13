CREATE TABLE users (
  id text PRIMARY KEY COLLATE "C",
  openid text NOT NULL UNIQUE COLLATE "C",
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  gender text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (gender IN ('UNKNOWN', 'FEMALE', 'MALE')),
  theme text NOT NULL DEFAULT 'NAVY'
    CHECK (theme IN ('NAVY', 'TEAL', 'BLUE', 'PURPLE', 'FOREST', 'WINE',
                     'SLATE', 'COFFEE', 'ROSE', 'INDIGO', 'OLIVE', 'RUST')),
  role text NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'ADMIN', 'MEMBER')),
  status text NOT NULL
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DISABLED')),
  joined_at timestamptz(3),
  reviewed_by text COLLATE "C",
  reviewed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL
);

CREATE UNIQUE INDEX users_single_owner ON users ((true)) WHERE role = 'OWNER';
CREATE INDEX users_role_status ON users (role, status);
CREATE INDEX users_created_at_id ON users (created_at DESC, id DESC);

CREATE TABLE join_requests (
  id text PRIMARY KEY COLLATE "C",
  applicant_id text NOT NULL COLLATE "C" REFERENCES users (id),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  requested_role text NOT NULL DEFAULT 'MEMBER'
    CHECK (requested_role IN ('ADMIN', 'MEMBER')),
  approved_role text CHECK (approved_role IN ('ADMIN', 'MEMBER')),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_comment text
    CHECK (review_comment IS NULL OR char_length(review_comment) BETWEEN 1 AND 250),
  reviewed_by text COLLATE "C",
  reviewed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL
);

CREATE UNIQUE INDEX join_requests_one_pending_per_applicant
  ON join_requests (applicant_id) WHERE status = 'PENDING';
CREATE INDEX join_requests_status_created_at_id
  ON join_requests (status, created_at DESC, id DESC);

CREATE TABLE categories (
  id text PRIMARY KEY COLLATE "C",
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  normalized_name text NOT NULL COLLATE "C",
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED', 'DELETED')),
  is_preset boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1000 CHECK (sort_order >= 0),
  item_reference_count integer CHECK (item_reference_count >= 0),
  created_by text COLLATE "C",
  created_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL,
  deleted_by text COLLATE "C",
  deleted_at timestamptz(3)
);

CREATE UNIQUE INDEX categories_normalized_name_live
  ON categories (normalized_name) WHERE status <> 'DELETED';
CREATE INDEX categories_status ON categories (status);

CREATE TABLE items (
  id text PRIMARY KEY COLLATE "C",
  code text NOT NULL UNIQUE COLLATE "C" CHECK (code ~ '^[0-9A-F]{12}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  images text[] NOT NULL DEFAULT '{}' CHECK (cardinality(images) <= 2),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  quantity_mode text NOT NULL CHECK (quantity_mode IN ('SINGLE', 'MULTIPLE')),
  quantity integer NOT NULL CHECK (quantity >= 1),
  category_id text NOT NULL COLLATE "C" REFERENCES categories (id) DEFERRABLE INITIALLY DEFERRED,
  status text NOT NULL
    CHECK (status IN ('ACTIVE', 'OUTBOUND_PENDING', 'OFF_SHELF', 'DELETED')),
  version integer NOT NULL CHECK (version >= 1),
  registered_by text NOT NULL COLLATE "C",
  registered_at timestamptz(3) NOT NULL,
  updated_by text NOT NULL COLLATE "C",
  updated_at timestamptz(3) NOT NULL,
  off_shelf_by text COLLATE "C",
  off_shelf_at timestamptz(3),
  deleted_by text COLLATE "C",
  deleted_at timestamptz(3),
  CONSTRAINT items_single_quantity
    CHECK (quantity_mode <> 'SINGLE' OR quantity = 1)
);

CREATE INDEX items_status_updated_at_id ON items (status, updated_at DESC, id DESC);
CREATE INDEX items_category_id_status ON items (category_id, status);
CREATE INDEX items_updated_at_id ON items (updated_at DESC, id DESC);

CREATE TABLE item_labels (
  id text PRIMARY KEY COLLATE "C",
  item_id text NOT NULL UNIQUE COLLATE "C" REFERENCES items (id) DEFERRABLE INITIALLY DEFERRED,
  public_code text NOT NULL UNIQUE COLLATE "C" CHECK (public_code ~ '^[0-9A-F]{12}$'),
  page text NOT NULL CHECK (page = 'pages/item-detail/index'),
  scene text NOT NULL CHECK (scene ~ '^i=[0-9A-F]{12}$'),
  file_id text,
  status text NOT NULL CHECK (status IN ('PENDING', 'READY', 'FAILED', 'VOID')),
  status_before_void text
    CHECK (status_before_void IN ('PENDING', 'READY', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  generation_token text,
  error_code text,
  error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 300),
  generated_at timestamptz(3),
  created_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL
);

CREATE TABLE item_operation_logs (
  id text PRIMARY KEY COLLATE "C",
  item_id text NOT NULL COLLATE "C" REFERENCES items (id) DEFERRABLE INITIALLY DEFERRED,
  operator_id text NOT NULL COLLATE "C",
  action_type text NOT NULL
    CHECK (action_type IN ('CREATE', 'UPDATE', 'OUTBOUND_REQUEST',
                           'OUTBOUND_APPROVE', 'OUTBOUND_REJECT',
                           'OUTBOUND', 'INBOUND')),
  commit_summary text NOT NULL
    CHECK (char_length(commit_summary) BETWEEN 1 AND 250),
  version_before integer NOT NULL CHECK (version_before >= 0),
  version_after integer NOT NULL CHECK (version_after >= 1),
  created_at timestamptz(3) NOT NULL,
  CONSTRAINT item_operation_logs_version_advances
    CHECK (version_after > version_before)
);

CREATE INDEX item_operation_logs_item_created_at_id
  ON item_operation_logs (item_id, created_at DESC, id DESC);

CREATE TABLE outbound_requests (
  id text PRIMARY KEY COLLATE "C",
  item_id text NOT NULL COLLATE "C" REFERENCES items (id) DEFERRABLE INITIALLY DEFERRED,
  applicant_id text NOT NULL COLLATE "C" REFERENCES users (id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 250),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_id text COLLATE "C",
  review_summary text
    CHECK (review_summary IS NULL OR char_length(review_summary) BETWEEN 1 AND 250),
  reviewed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL
);

CREATE UNIQUE INDEX outbound_requests_one_pending_per_item
  ON outbound_requests (item_id) WHERE status = 'PENDING';
CREATE INDEX outbound_requests_status_created_at_id
  ON outbound_requests (status, created_at DESC, id DESC);
CREATE INDEX outbound_requests_applicant_created_at_id
  ON outbound_requests (applicant_id, created_at DESC, id DESC);
