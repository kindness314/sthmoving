export interface StoredSession {
  token: string
  expiresAt: number
}

export interface SessionDependencies {
  load(): StoredSession | null
  save(session: StoredSession | null): void
  acquire(): Promise<StoredSession>
  now(): number
}

export const sessionRefreshMarginMs = 60 * 1000
export const sessionStorageKey = 'sthmoving-session'

export class SessionManager {
  private pending: Promise<string> | null = null

  private generation = 0

  constructor(private readonly deps: SessionDependencies) {}

  async getToken(): Promise<string> {
    const stored = this.deps.load()
    if (stored && stored.expiresAt - this.deps.now() > sessionRefreshMarginMs) {
      return stored.token
    }
    return this.refresh()
  }

  invalidate(): void {
    // 代际递增使在途刷新失效：其完成回调不得再把新令牌写回本地
    this.generation += 1
    this.pending = null
    this.deps.save(null)
  }

  adopt(session: StoredSession): void {
    this.generation += 1
    this.pending = null
    this.deps.save(session)
  }

  private refresh(): Promise<string> {
    if (this.pending === null) {
      const generation = this.generation
      this.pending = this.deps
        .acquire()
        .then((session) => {
          if (generation === this.generation) {
            this.deps.save(session)
          }
          return session.token
        })
        .finally(() => {
          if (generation === this.generation) {
            this.pending = null
          }
        })
    }
    return this.pending
  }
}

export function createStorageSessionDependencies(
  acquire: () => Promise<StoredSession>,
): SessionDependencies {
  return {
    load: () => {
      const stored = wx.getStorageSync(sessionStorageKey) as
        | StoredSession
        | ''
        | null
      return stored && typeof stored.token === 'string' ? stored : null
    },
    save: (session) => {
      if (session) {
        wx.setStorageSync(sessionStorageKey, session)
      } else {
        wx.removeStorageSync(sessionStorageKey)
      }
    },
    acquire,
    now: () => Date.now(),
  }
}
