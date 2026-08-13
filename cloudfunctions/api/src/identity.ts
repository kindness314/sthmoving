import { createHash } from 'node:crypto'

export function deriveUserId(openid: string): string {
  return createHash('sha256').update(openid).digest('hex').slice(0, 32)
}
