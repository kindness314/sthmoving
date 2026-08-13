import type { IncomingMessage } from 'node:http'

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadTooLargeError'
  }
}

export async function readBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) {
      request.destroy()
      throw new PayloadTooLargeError('请求体超出大小限制')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const body = await readBody(request, maxBytes)
  if (body.length === 0) {
    return {}
  }
  return JSON.parse(body.toString('utf8'))
}
