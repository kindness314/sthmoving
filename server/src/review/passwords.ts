import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// 去掉易混字符（I/L/O/U/0/1）的 30 字符表，便于人工转录
const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export const testPasswordLength = 16

const groupSize = 4

export interface GeneratedTestPassword {
  readonly plaintext: string
  readonly hash: string
  readonly salt: string
}

function randomCharacter(): string {
  // 拒绝采样，避免取模偏差
  const limit = Math.floor(256 / alphabet.length) * alphabet.length
  for (;;) {
    const byte = randomBytes(1)[0]
    if (byte !== undefined && byte < limit) {
      return alphabet[byte % alphabet.length]!
    }
  }
}

export function generateTestPassword(): GeneratedTestPassword {
  let plaintext = ''
  for (let index = 0; index < testPasswordLength; index += 1) {
    plaintext += randomCharacter()
  }
  const salt = randomBytes(16).toString('hex')
  return { plaintext, salt, hash: hashTestPassword(plaintext, salt) }
}

/** 输入容错：忽略分隔符与大小写，与生成时的字符集对齐。 */
export function normalizeTestPassword(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

export function hashTestPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex')
}

export function verifyTestPassword(
  input: string,
  salt: string,
  expectedHash: string,
): boolean {
  const candidate = Buffer.from(
    hashTestPassword(normalizeTestPassword(input), salt),
    'utf8',
  )
  const expected = Buffer.from(expectedHash, 'utf8')
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  )
}

/** 展示用分组：XXXX-XXXX-XXXX-XXXX。 */
export function formatTestPassword(plaintext: string): string {
  const groups = plaintext.match(new RegExp(`.{1,${groupSize}}`, 'g')) ?? []
  return groups.join('-')
}
