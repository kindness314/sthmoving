import { createHmac, timingSafeEqual } from 'node:crypto'

export type FileAccessMode = 'download' | 'upload'

export const minSigningSecretLength = 32

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(actual, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

export class FileUrlSigner {
  constructor(
    private readonly secret: string,
    private readonly baseUrl: string,
    private readonly now: () => number = Date.now,
  ) {
    if (secret.length < minSigningSecretLength) {
      throw new Error(`文件签名密钥至少需要 ${minSigningSecretLength} 位`)
    }
  }

  sign(mode: FileAccessMode, path: string, ttlMilliseconds: number): string {
    const expires = Math.floor((this.now() + ttlMilliseconds) / 1000)
    const query = new URLSearchParams({
      mode,
      expires: String(expires),
      signature: this.signature(mode, path, expires),
    })
    return `${this.baseUrl.replace(/\/+$/, '')}/files/${path}?${query.toString()}`
  }

  verify(
    mode: FileAccessMode,
    path: string,
    expires: string | null,
    signature: string | null,
  ): boolean {
    if (!expires || !signature) {
      return false
    }
    const deadline = Number(expires)
    if (!Number.isInteger(deadline) || deadline * 1000 <= this.now()) {
      return false
    }
    return safeEqual(this.signature(mode, path, deadline), signature)
  }

  private signature(
    mode: FileAccessMode,
    path: string,
    expires: number,
  ): string {
    return createHmac('sha256', this.secret)
      .update(`${mode}:${path}:${expires}`)
      .digest('hex')
  }
}
