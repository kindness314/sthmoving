import type { IncomingMessage } from 'node:http'

// 进程内固定窗口限流。生产环境 api 只被 Caddy 访问（8080 不对外发布），
// 因此信任 Caddy 写入的 X-Forwarded-For；直接访问时退回 socket 地址。
export function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }
  return request.socket.remoteAddress ?? 'unknown'
}

interface WindowCounter {
  windowStart: number
  count: number
}

export class RateLimiter {
  private readonly counters = new Map<string, WindowCounter>()

  constructor(
    private readonly limit: number,
    private readonly windowMilliseconds: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  tryAcquire(key: string): boolean {
    const now = this.now()
    const counter = this.counters.get(key)
    if (counter === undefined || now - counter.windowStart >= this.windowMilliseconds) {
      this.counters.set(key, { windowStart: now, count: 1 })
    } else {
      counter.count += 1
      if (counter.count > this.limit) {
        return false
      }
    }
    // 防止计数表无限增长
    if (this.counters.size > 10000) {
      for (const [storedKey, stored] of this.counters) {
        if (now - stored.windowStart >= this.windowMilliseconds) {
          this.counters.delete(storedKey)
        }
      }
    }
    return true
  }
}
