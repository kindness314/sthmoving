import { ApiException } from '../../../cloudfunctions/api/src/errors'
import type { WeChatCredentials } from '../auth/wechat'

export interface AccessTokenProvider {
  getToken(): Promise<string>
  invalidate(): void
}

interface TokenResponse {
  access_token?: unknown
  expires_in?: unknown
  errcode?: unknown
  errmsg?: unknown
}

export const accessTokenRefreshMarginMs = 5 * 60 * 1000

export class WeChatAccessTokenProvider implements AccessTokenProvider {
  private cached: { token: string; expiresAt: number } | null = null
  private pending: Promise<string> | null = null

  constructor(
    private readonly credentials: WeChatCredentials,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(): Promise<string> {
    const cached = this.cached
    if (cached && cached.expiresAt - this.now() > accessTokenRefreshMarginMs) {
      return cached.token
    }
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  invalidate(): void {
    this.cached = null
  }

  private async fetchToken(): Promise<string> {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
    url.searchParams.set('grant_type', 'client_credential')
    url.searchParams.set('appid', this.credentials.appId)
    url.searchParams.set('secret', this.credentials.appSecret)

    const response = await this.request(url)
    if (!response.ok) {
      throw new ApiException('SERVICE_UNAVAILABLE', '微信接口凭证获取失败')
    }

    const body = (await response.json()) as TokenResponse
    if (
      typeof body.access_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      throw new ApiException('SERVICE_UNAVAILABLE', '微信接口凭证获取失败')
    }

    this.cached = {
      token: body.access_token,
      expiresAt: this.now() + body.expires_in * 1000,
    }
    return body.access_token
  }
}
