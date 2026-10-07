-- 物品归属：owner_id 非空表示私人物品，donor_id 表示公有物品的捐赠者，两者互斥
ALTER TABLE items
  ADD COLUMN owner_id text COLLATE "C" REFERENCES users (id),
  ADD COLUMN donor_id text COLLATE "C" REFERENCES users (id),
  ADD CONSTRAINT items_ownership_exclusive
    CHECK (NOT (owner_id IS NOT NULL AND donor_id IS NOT NULL));

-- 归属筛选索引：items_owner_id（owner_id 升序，非唯一）、items_donor_id（donor_id 升序，非唯一）
CREATE INDEX items_owner_id ON items (owner_id);
CREATE INDEX items_donor_id ON items (donor_id);
