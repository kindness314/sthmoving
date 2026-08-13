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

  constructor(private readonly deps: SessionDependencies) {}

  async getToken(): Promise<string> {
    const stored = this.deps.load()
    if (stored && stored.expiresAt - this.deps.now() > sessionRefreshMarginMs) {
      return stored.token
    }
    return this.refresh()
  }

  invalidate(): void {
    this.deps.save(null)
  }

  private refresh(): Promise<string> {
    this.pending ??= this.deps
      .acquire()
      .then((session) => {
        this.deps.save(session)
        return session.token
      })
      .finally(() => {
        this.pending = null
      })
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
