import { ApiException } from '../../../cloudfunctions/api/src/errors'
import type {
  GenerateMiniProgramCodeInput,
  MiniProgramCodeGenerator,
} from '../../../cloudfunctions/api/src/labels/external'
import type { AccessTokenProvider } from './access-token'

const endpoint = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit'
const invalidTokenErrors = new Set([40001, 40014, 42001])

function parseErrorCode(content: Buffer, contentType: string): number | null {
  if (!contentType.includes('application/json') && content[0] !== 0x7b) {
    return null
  }
  try {
    const body = JSON.parse(content.toString('utf8')) as { errcode?: unknown }
    return typeof body.errcode === 'number' ? body.errcode : null
  } catch {
    return null
  }
}

export class HttpMiniProgramCodeGenerator implements MiniProgramCodeGenerator {
  constructor(
    private readonly accessTokens: AccessTokenProvider,
    private readonly request: typeof fetch = fetch,
  ) {}

  async generate(input: GenerateMiniProgramCodeInput): Promise<Buffer> {
    const first = await this.attempt(input)
    if (first !== null) {
      return first
    }
    this.accessTokens.invalidate()
    const retried = await this.attempt(input)
    if (retried === null) {
      throw new ApiException('SERVICE_UNAVAILABLE', '微信接口凭证失效')
    }
    return retried
  }

  private async attempt(
    input: GenerateMiniProgramCodeInput,
  ): Promise<Buffer | null> {
    const url = new URL(endpoint)
    url.searchParams.set('access_token', await this.accessTokens.getToken())

    const response = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: input.page,
        scene: input.scene,
        check_path: input.environment === 'release',
        env_version: input.environment,
        width: 1280,
        auto_color: false,
        line_color: { r: 0, g: 0, b: 0 },
        is_hyaline: false,
      }),
    })
    if (!response.ok) {
      throw new ApiException('SERVICE_UNAVAILABLE', '微信接口暂不可用')
    }

    const content = Buffer.from(await response.arrayBuffer())
    const errcode = parseErrorCode(
      content,
      response.headers.get('content-type') ?? '',
    )
    if (errcode === null) {
      return content
    }
    if (invalidTokenErrors.has(errcode)) {
      return null
    }
    throw new ApiException('SERVICE_UNAVAILABLE', `微信接口返回错误 ${errcode}`)
  }
}
