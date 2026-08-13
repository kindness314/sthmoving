import { timingSafeEqual } from 'node:crypto'

import type { ApiDependencies } from '../dependencies'
import { ApiException } from '../errors'
import { MembershipService } from '../membership/service'
import type { ApiHandler } from '../types'

interface BootstrapPayload {
  token?: unknown
}

const minBootstrapTokenLength = 16

function createService(deps: ApiDependencies): MembershipService {
  return new MembershipService(deps.membership)
}

function matchesBootstrapToken(
  configured: string | undefined,
  submitted: unknown,
): boolean {
  if (
    !configured ||
    configured.length < minBootstrapTokenLength ||
    typeof submitted !== 'string'
  ) {
    return false
  }
  const expected = Buffer.from(configured, 'utf8')
  const actual = Buffer.from(submitted, 'utf8')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function createAuthHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
    login: async (_payload, context) =>
      createService(deps).login(context.userId, context.openid),

    bootstrapOwner: async (payload, context) => {
      const submittedToken = (payload as BootstrapPayload | undefined)?.token
      if (
        !matchesBootstrapToken(
          process.env['OWNER_BOOTSTRAP_TOKEN'],
          submittedToken,
        )
      ) {
        throw new ApiException(
          'INVALID_BOOTSTRAP_TOKEN',
          '所有者初始化口令无效或未配置',
        )
      }
      return createService(deps).bootstrapOwner(context.userId, context.openid)
    },
  }
}
