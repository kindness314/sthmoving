import { ApiException } from '../../../cloudfunctions/api/src/errors'
import type { MembershipRepository } from '../../../cloudfunctions/api/src/membership/repository'
import type { IssuedSession, SessionStore } from '../auth/sessions'
import type { TestAccessControl } from './access'
import { verifyTestPassword } from './passwords'
import { ensureSandboxOwner, sandboxUserId } from './sandbox'

export interface TestSessionServiceOptions {
  /** 生产库的控制面存储（口令源）。 */
  readonly access: TestAccessControl
  /** 沙箱库仓储与会话存储。 */
  readonly membership: MembershipRepository
  readonly sessions: SessionStore
  readonly now?: () => Date
}

export interface TestSessionService {
  start(password: string): Promise<IssuedSession>
}

export function createTestSessionService(
  options: TestSessionServiceOptions,
): TestSessionService {
  const now = options.now ?? (() => new Date())

  return {
    start: async (password) => {
      const active = await options.access.active()
      if (!active) {
        throw new ApiException('TEST_ACCESS_CLOSED', '测试入口未开启或已过期')
      }
      if (
        !verifyTestPassword(password, active.passwordSalt, active.passwordHash)
      ) {
        throw new ApiException('INVALID_TEST_PASSWORD', '测试口令不正确')
      }

      await ensureSandboxOwner(options.membership, now().toISOString())
      const issued = await options.sessions.issue(sandboxUserId)
      await options.access.recordUse(active.id)
      return issued
    },
  }
}
