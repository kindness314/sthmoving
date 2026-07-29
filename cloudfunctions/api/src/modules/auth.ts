import { ApiException } from '../errors'
import { CloudMembershipRepository } from '../membership/cloud-repository'
import { MembershipService } from '../membership/service'
import type { ApiHandler } from '../types'

interface BootstrapPayload {
  token?: unknown
}

function createService(): MembershipService {
  return new MembershipService(new CloudMembershipRepository())
}

export const authHandlers: Readonly<Record<string, ApiHandler>> = {
  login: async (_payload, context) => createService().login(context.openid),

  bootstrapOwner: async (payload, context) => {
    const configuredToken = process.env['OWNER_BOOTSTRAP_TOKEN']
    const submittedToken = (payload as BootstrapPayload | undefined)?.token
    if (
      !configuredToken ||
      configuredToken.length < 16 ||
      typeof submittedToken !== 'string' ||
      submittedToken !== configuredToken
    ) {
      throw new ApiException(
        'INVALID_BOOTSTRAP_TOKEN',
        '所有者初始化口令无效或未配置',
      )
    }
    return createService().bootstrapOwner(context.openid)
  },
}
