import { ApiException } from '../../../cloudfunctions/api/src/errors'

export interface WeChatCredentials {
  readonly appId: string
  readonly appSecret: string
}

export interface WeChatAuthClient {
  codeToOpenid(code: string): Promise<string>
}

interface CodeSessionResponse {
  openid?: unknown
  errcode?: unknown
  errmsg?: unknown
}

const invalidCodeErrors = new Set([40029, 40163, 45011])

export class HttpWeChatAuthClient implements WeChatAuthClient {
  constructor(
    private readonly credentials: WeChatCredentials,
    private readonly request: typeof fetch = fetch,
  ) {}

  async codeToOpenid(code: string): Promise<string> {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', this.credentials.appId)
    url.searchParams.set('secret', this.credentials.appSecret)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    const response = await this.request(url)
    if (!response.ok) {
      throw new ApiException('SERVICE_UNAVAILABLE', '微信登录服务暂不可用')
    }

    const body = (await response.json()) as CodeSessionResponse
    const errcode = typeof body.errcode === 'number' ? body.errcode : 0
    if (errcode !== 0) {
      throw invalidCodeErrors.has(errcode)
        ? new ApiException('INVALID_LOGIN_CODE', '微信登录凭证无效或已过期')
        : new ApiException('SERVICE_UNAVAILABLE', '微信登录服务暂不可用')
    }
    if (typeof body.openid !== 'string' || body.openid.length === 0) {
      throw new ApiException('SERVICE_UNAVAILABLE', '微信登录服务未返回用户标识')
    }
    return body.openid
  }
}
