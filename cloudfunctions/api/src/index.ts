import cloud from 'wx-server-sdk'

import { createCloudDependencies } from './dependencies.cloud'
import { deriveUserId } from './identity'
import { createRouter } from './router'
import type { ApiEvent } from './types'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV as unknown as string,
})

const route = createRouter(createCloudDependencies())

export async function main(event: ApiEvent) {
  const wxContext = cloud.getWXContext()
  if (!wxContext.OPENID) {
    return {
      ok: false as const,
      error: {
        code: 'UNAUTHENTICATED',
        message: '无法获取微信用户身份',
      },
    }
  }
  return route(event, {
    userId: deriveUserId(wxContext.OPENID),
    openid: wxContext.OPENID,
  })
}
