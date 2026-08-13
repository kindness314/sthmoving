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
  }
}
