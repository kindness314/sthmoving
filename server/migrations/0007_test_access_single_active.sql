-- 任意时刻最多一条未吊销口令：并发生成时后到者被唯一索引拒绝，
-- 调用方重试即可，避免产生两行「有效」口令而其中一行被 active() 遮蔽后静默失效。
CREATE UNIQUE INDEX test_access_single_active ON test_access ((1)) WHERE revoked_at IS NULL;
