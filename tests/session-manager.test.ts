import { describe, expect, it, vi } from 'vitest'

import type { StoredSession } from '../miniprogram/services/session'
import { SessionManager } from '../miniprogram/services/session'

function createManager(
  acquire: () => Promise<StoredSession>,
  initial: StoredSession | null = null,
) {
  let stored = initial
  let currentTime = 1_000_000
  const manager = new SessionManager({
    load: () => stored,
    save: (session) => {
      stored = session
    },
    acquire,
    now: () => currentTime,
  })
  return {
    manager,
    read: () => stored,
    advance: (milliseconds: number) => {
      currentTime += milliseconds
    },
  }
}

describe('小程序会话令牌', () => {
  it('未接近过期时直接复用缓存令牌', async () => {
    const acquire = vi.fn(async () => ({ token: '新令牌', expiresAt: 0 }))
    const { manager } = createManager(acquire, {
      token: '旧令牌',
      expiresAt: 1_000_000 + 600_000,
    })

    await expect(manager.getToken()).resolves.toBe('旧令牌')
    expect(acquire).not.toHaveBeenCalled()
  })

  it('令牌过期后重新获取并写回存储', async () => {
    const acquire = vi.fn(async () => ({
      token: '新令牌',
      expiresAt: 2_000_000,
    }))
    const { manager, read } = createManager(acquire, {
      token: '旧令牌',
      expiresAt: 1_000_000 - 1,
    })

    await expect(manager.getToken()).resolves.toBe('新令牌')
    expect(read()).toEqual({ token: '新令牌', expiresAt: 2_000_000 })
  })

  it('并发刷新只发起一次请求', async () => {
    let release: (session: StoredSession) => void = () => {}
    const acquire = vi.fn(
      () =>
        new Promise<StoredSession>((resolve) => {
          release = resolve
        }),
    )
    const { manager } = createManager(acquire)

    const requests = [
      manager.getToken(),
      manager.getToken(),
      manager.getToken(),
    ]
    release({ token: '共享令牌', expiresAt: 2_000_000 })

    await expect(Promise.all(requests)).resolves.toEqual([
      '共享令牌',
      '共享令牌',
      '共享令牌',
    ])
    expect(acquire).toHaveBeenCalledTimes(1)
  })

  it('刷新失败后允许重试', async () => {
    const acquire = vi
      .fn<() => Promise<StoredSession>>()
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockResolvedValueOnce({ token: '重试令牌', expiresAt: 2_000_000 })
    const { manager } = createManager(acquire)

    await expect(manager.getToken()).rejects.toThrow('网络错误')
    await expect(manager.getToken()).resolves.toBe('重试令牌')
    expect(acquire).toHaveBeenCalledTimes(2)
  })

  it('作废令牌后重新获取', async () => {
    const acquire = vi.fn(async () => ({
      token: '新令牌',
      expiresAt: 2_000_000,
    }))
    const { manager, read } = createManager(acquire, {
      token: '旧令牌',
      expiresAt: 1_000_000 + 600_000,
    })

    manager.invalidate()
    expect(read()).toBeNull()
    await expect(manager.getToken()).resolves.toBe('新令牌')
  })

  it('缓存令牌进入安全边界内时提前刷新', async () => {
    const acquire = vi.fn(async () => ({
      token: '新令牌',
      expiresAt: 2_000_000,
    }))
    const { manager, advance } = createManager(acquire, {
      token: '旧令牌',
      expiresAt: 1_000_000 + 90_000,
    })

    await expect(manager.getToken()).resolves.toBe('旧令牌')
    advance(60_000)
    await expect(manager.getToken()).resolves.toBe('新令牌')
  })
})
