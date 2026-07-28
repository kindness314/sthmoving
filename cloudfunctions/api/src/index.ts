import cloud from 'wx-server-sdk'

import { route } from './router'
import type { ApiEvent } from './types'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV as unknown as string,
})

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
    openid: wxContext.OPENID,
  })
}
