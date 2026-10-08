-- 物品所属办公室：503 / 102 / 103 三选一，必填，默认 503
ALTER TABLE items
  ADD COLUMN office text NOT NULL DEFAULT '503',
  ADD CONSTRAINT items_office_check
    CHECK (office IN ('503', '102', '103'));
