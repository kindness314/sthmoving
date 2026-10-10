import { describe, expect, it } from 'vitest'

import { readServerConfig } from '../../server/src/config'

function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgres://u:p@db.internal:5432/sthmoving',
    WECHAT_APP_ID: 'wx-test',
    WECHAT_APP_SECRET: 'secret',
    PUBLIC_BASE_URL: 'https://example.com',
    FILE_SIGNING_SECRET: 'a'.repeat(32),
    ...overrides,
  }
}

describe('沙箱配置防呆', () => {
  it('TEST_DATABASE_URL 指向生产库时拒绝启动', () => {
    expect(() =>
      readServerConfig(
        baseEnv({ TEST_DATABASE_URL: 'postgres://u:p@db.internal:5432/sthmoving' }),
      ),
    ).toThrow('TEST_DATABASE_URL 不得指向生产数据库')
  })

  it('同库的不同写法（省略默认端口）同样拒绝', () => {
    expect(() =>
      readServerConfig(
        baseEnv({ TEST_DATABASE_URL: 'postgres://u:p@db.internal/sthmoving' }),
      ),
    ).toThrow('TEST_DATABASE_URL 不得指向生产数据库')
  })

  it('TEST_STORAGE_ROOT 与生产根相同或嵌套时拒绝', () => {
    expect(() =>
      readServerConfig(
        baseEnv({
          TEST_DATABASE_URL: 'postgres://u:p@db.internal:5432/sthmoving_sandbox',
          TEST_STORAGE_ROOT: 'storage',
        }),
      ),
    ).toThrow('TEST_STORAGE_ROOT 不得与 STORAGE_ROOT 相同或互相嵌套')
    expect(() =>
      readServerConfig(
        baseEnv({
          TEST_DATABASE_URL: 'postgres://u:p@db.internal:5432/sthmoving_sandbox',
          TEST_STORAGE_ROOT: 'storage/__test',
        }),
      ),
    ).toThrow('TEST_STORAGE_ROOT 不得与 STORAGE_ROOT 相同或互相嵌套')
  })

  it('TEST_FILE_SIGNING_SECRET 与生产密钥相同时拒绝', () => {
    expect(() =>
      readServerConfig(
        baseEnv({
          TEST_DATABASE_URL: 'postgres://u:p@db.internal:5432/sthmoving_sandbox',
          TEST_FILE_SIGNING_SECRET: 'a'.repeat(32),
        }),
      ),
    ).toThrow('TEST_FILE_SIGNING_SECRET 不得与 FILE_SIGNING_SECRET 相同')
  })

  it('默认沙箱存储根与生产平级，签名密钥派生且不同', () => {
    const config = readServerConfig(
      baseEnv({ TEST_DATABASE_URL: 'postgres://u:p@db.internal:5432/sthmoving_sandbox' }),
    )
    expect(config.testStorageRoot).toBe('storage-test')
    expect(config.testFileSigningSecret).toBeDefined()
    expect(config.testFileSigningSecret).not.toBe('a'.repeat(32))
  })

  it('未配置 TEST_DATABASE_URL 时沙箱整体关闭且不校验其余项', () => {
    const config = readServerConfig(baseEnv())
    expect(config.testDatabaseUrl).toBeUndefined()
    expect(config.testStorageRoot).toBeUndefined()
    expect(config.testFileSigningSecret).toBeUndefined()
  })
})
