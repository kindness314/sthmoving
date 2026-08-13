import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'

import { describe, expect, it } from 'vitest'

import { PayloadTooLargeError, readJsonBody } from '../../server/src/http/body'
import { statusForErrorCode } from '../../server/src/http/respond'

function requestOf(body: string): IncomingMessage {
  return Readable.from([Buffer.from(body, 'utf8')]) as unknown as IncomingMessage
}

describe('HTTP 请求体解析', () => {
  it('解析 JSON 请求体', async () => {
    await expect(
      readJsonBody(requestOf('{"module":"system"}'), 1024),
    ).resolves.toEqual({ module: 'system' })
  })

  it('把空请求体当作空对象', async () => {
    await expect(readJsonBody(requestOf(''), 1024)).resolves.toEqual({})
  })

  it('超出上限时中断读取', async () => {
    await expect(
      readJsonBody(requestOf('a'.repeat(64)), 16),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it('非法 JSON 抛出解析错误', async () => {
    await expect(readJsonBody(requestOf('{'), 1024)).rejects.toBeInstanceOf(
      SyntaxError,
    )
  })
})

describe('HTTP 状态码', () => {
  it('传输层错误映射到对应状态码', () => {
    expect(statusForErrorCode('UNAUTHENTICATED')).toBe(401)
    expect(statusForErrorCode('NOT_IMPLEMENTED')).toBe(404)
    expect(statusForErrorCode('PAYLOAD_TOO_LARGE')).toBe(413)
    expect(statusForErrorCode('INTERNAL_ERROR')).toBe(500)
  })

  it('业务错误保持 200 由响应体表达', () => {
    expect(statusForErrorCode('ITEM_NOT_FOUND')).toBe(200)
    expect(statusForErrorCode('VERSION_CONFLICT')).toBe(200)
  })
})
