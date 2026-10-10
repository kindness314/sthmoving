import { createHash } from 'node:crypto'

import type { MiniProgramEnvironment } from '../../cloudfunctions/api/src/labels/environment'
import { readMiniProgramEnvironment } from '../../cloudfunctions/api/src/labels/environment'

export interface ServerConfig {
  readonly port: number
  readonly databaseUrl: string
  readonly databasePoolMax: number
  readonly runMigrations: boolean
  readonly sessionTtlDays: number
  readonly wechatAppId: string
  readonly wechatAppSecret: string
  readonly publicBaseUrl: string
  readonly storageRoot: string
  readonly fileSigningSecret: string
  readonly fileUrlTtlSeconds: number
  readonly uploadUrlTtlSeconds: number
  readonly miniProgramEnvironment: MiniProgramEnvironment
  /** 审核沙箱库；未配置时沙箱整体关闭。 */
  readonly testDatabaseUrl?: string
  /** 沙箱文件根目录；独立于生产存储根。 */
  readonly testStorageRoot?: string
  /** 沙箱文件签名密钥，与生产不同以保证签名不可跨域使用。 */
  readonly testFileSigningSecret?: string
  /** 测试口令有效期（小时）。 */
  readonly testAccessTtlHours: number
}

export function requireEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

export function readNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = env[name]
  if (value === undefined || value === '') {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数`)
  }
  return parsed
}

export function readBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const value = env[name]
  if (value === undefined || value === '') {
    return fallback
  }
  if (value !== 'true' && value !== 'false') {
    throw new Error(`环境变量 ${name} 只能是 true 或 false`)
  }
  return value === 'true'
}

export function readServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return {
    port: readNumber(env, 'PORT', 8080),
    databaseUrl: requireEnv(env, 'DATABASE_URL'),
    databasePoolMax: readNumber(env, 'DATABASE_POOL_MAX', 10),
    runMigrations: readBoolean(env, 'RUN_MIGRATIONS', true),
    sessionTtlDays: readNumber(env, 'SESSION_TTL_DAYS', 30),
    wechatAppId: requireEnv(env, 'WECHAT_APP_ID'),
    wechatAppSecret: requireEnv(env, 'WECHAT_APP_SECRET'),
    publicBaseUrl: requireEnv(env, 'PUBLIC_BASE_URL'),
    storageRoot: env['STORAGE_ROOT'] ?? 'storage',
    fileSigningSecret: requireEnv(env, 'FILE_SIGNING_SECRET'),
    fileUrlTtlSeconds: readNumber(env, 'FILE_URL_TTL_SECONDS', 600),
    uploadUrlTtlSeconds: readNumber(env, 'UPLOAD_URL_TTL_SECONDS', 300),
    miniProgramEnvironment: readMiniProgramEnvironment(
      env['MINI_PROGRAM_ENVIRONMENT'],
      'release',
    ),
    ...readTestRealmConfig(env),
  }
}

function readOptional(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]
  return value === undefined || value.trim() === '' ? undefined : value
}

function readTestRealmConfig(
  env: NodeJS.ProcessEnv,
): Pick<
  ServerConfig,
  | 'testDatabaseUrl'
  | 'testStorageRoot'
  | 'testFileSigningSecret'
  | 'testAccessTtlHours'
> {
  const testDatabaseUrl = readOptional(env, 'TEST_DATABASE_URL')
  const ttlHours = readNumber(env, 'TEST_ACCESS_TTL_HOURS', 168)
  if (testDatabaseUrl === undefined) {
    return { testAccessTtlHours: ttlHours }
  }
  const storageRoot = env['STORAGE_ROOT'] ?? 'storage'
  return {
    testDatabaseUrl,
    testStorageRoot:
      readOptional(env, 'TEST_STORAGE_ROOT') ?? `${storageRoot}/__test`,
    // 未显式配置时由生产密钥派生，保证两域签名密钥必然不同且无需额外运维
    testFileSigningSecret:
      readOptional(env, 'TEST_FILE_SIGNING_SECRET') ??
      createHash('sha256')
        .update(`${requireEnv(env, 'FILE_SIGNING_SECRET')}:review-test`)
        .digest('hex'),
    testAccessTtlHours: ttlHours,
  }
}
