import type { IncomingMessage, Server } from 'node:http'

import type { Pool } from 'pg'

import type { ApiDependencies } from '../../cloudfunctions/api/src/dependencies'
import type { ApiRouter } from '../../cloudfunctions/api/src/router'
import { createRouter } from '../../cloudfunctions/api/src/router'
import type {
  ApiEvent,
  ApiResponse,
  RequestContext,
} from '../../cloudfunctions/api/src/types'
import {
  createBearerAuthenticator,
  createLogoutRoute,
  createRealmAuthenticator,
  createSessionRoute,
  createTestAccessStatusRoute,
  createTestSessionRoute,
  testSessionTokenPrefix,
} from './auth/routes'
import type { SessionStore } from './auth/sessions'
import { PostgresSessionStore } from './auth/sessions'
import type { WeChatAuthClient } from './auth/wechat'
import { HttpWeChatAuthClient } from './auth/wechat'
import type { ServerConfig } from './config'
import { migrate } from './db/migrate'
import { createPool } from './db/pool'
import type { ExternalDependencies } from './dependencies.pg'
import { createPgDependencies } from './dependencies.pg'
import type { HttpRateLimits, HttpRoute } from './http/server'
import { createHttpApi } from './http/server'
import { TestAccessStore } from './review/access'
import { createReviewRouter } from './review/handlers'
import { createTestSessionService } from './review/test-session'
import { createFileServices } from './storage/external'
import { PostgresFileRegistry } from './storage/files'
import { LocalFileStorage } from './storage/local'
import type { FileRouteRealms } from './storage/routes'
import { createFileRoutes } from './storage/routes'
import { FileUrlSigner } from './storage/signing'
import { WeChatAccessTokenProvider } from './wechat/access-token'
import { HttpMiniProgramCodeGenerator } from './wechat/mini-program-code'

export interface ServerOverrides {
  authenticate?: (request: IncomingMessage) => Promise<RequestContext>
  external?: Partial<ExternalDependencies>
  routes?: readonly HttpRoute[]
  rateLimits?: HttpRateLimits
  wechat?: WeChatAuthClient
}

export interface StartedServer {
  readonly server: Server
  readonly pool: Pool
  readonly port: number
  close(): Promise<void>
}

function listen(server: Server, port: number): Promise<number> {
  const started = Promise.withResolvers<number>()
  const onError = (error: Error) => started.reject(error)
  server.once('error', onError)
  server.listen(port, () => {
    server.off('error', onError)
    const address = server.address()
    started.resolve(
      typeof address === 'object' && address ? address.port : port,
    )
  })
  return started.promise
}

interface RealmAssembly {
  readonly storage: LocalFileStorage
  readonly registry: PostgresFileRegistry
  readonly signer: FileUrlSigner
  readonly dependencies: ApiDependencies
  readonly router: ApiRouter
}

/**
 * 请求进入业务路由前的数据域分发：
 * `review` 模块固定走控制面（内部再校验生产域与角色），其余按请求数据域选装配。
 */
export function createRealmDispatch(
  prod: ApiRouter,
  test: ApiRouter | null,
  review: ApiRouter,
): ApiRouter {
  return async (event, context) => {
    if (event.module === 'review') {
      return review(event, context)
    }
    const assembly = context.realm === 'test' && test ? test : prod
    return assembly(event, context)
  }
}

export async function startServer(
  config: ServerConfig,
  overrides: ServerOverrides = {},
): Promise<StartedServer> {
  const pool = createPool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
  })
  const testDatabaseUrl = config.testDatabaseUrl
  const testPool = testDatabaseUrl
    ? createPool({
        connectionString: testDatabaseUrl,
        max: config.databasePoolMax,
      })
    : null
  // 空闲连接被服务端或运维中断时（如 pg_terminate_backend、重启），
  // 未处理的 'error' 事件会让进程崩溃，这里统一降级为日志。
  pool.on('error', (error) => {
    console.error('生产数据库连接异常', error)
  })
  testPool?.on('error', (error) => {
    console.error('沙箱数据库连接异常', error)
  })

  try {
    if (config.runMigrations) {
      await migrate(pool)
      if (testPool) {
        // 沙箱库与生产库同源迁移，schema 永不漂移
        await migrate(testPool)
      }
    }

    const credentials = {
      appId: config.wechatAppId,
      appSecret: config.wechatAppSecret,
    }
    const accessTokens = new WeChatAccessTokenProvider(credentials)
    const sessionTtlMilliseconds = config.sessionTtlDays * 24 * 60 * 60 * 1000
    const sessions = new PostgresSessionStore(pool, sessionTtlMilliseconds)
    const testSessions = testPool
      ? new PostgresSessionStore(testPool, sessionTtlMilliseconds, {
          tokenPrefix: testSessionTokenPrefix,
        })
      : null

    const buildRealm = (options: {
      readonly pool: Pool
      readonly storageRoot: string
      readonly signingSecret: string
      readonly realmSessions: SessionStore
    }): RealmAssembly => {
      const storage = new LocalFileStorage(options.storageRoot)
      const registry = new PostgresFileRegistry(options.pool)
      const signer = new FileUrlSigner(options.signingSecret, config.publicBaseUrl)
      const dependencies = {
        ...createPgDependencies(options.pool, {
          ...createFileServices({
            storage,
            registry,
            signer,
            downloadTtlMilliseconds: config.fileUrlTtlSeconds * 1000,
          }),
          miniProgramCode: new HttpMiniProgramCodeGenerator(accessTokens),
          miniProgramEnvironment: config.miniProgramEnvironment,
          ...overrides.external,
        }),
        revokeUserSessions: (userId: string) =>
          options.realmSessions.revokeUser(userId),
      }
      return {
        storage,
        registry,
        signer,
        dependencies,
        router: createRouter(dependencies),
      }
    }

    const prod = buildRealm({
      pool,
      storageRoot: config.storageRoot,
      signingSecret: config.fileSigningSecret,
      realmSessions: sessions,
    })
    const testStorageRoot = config.testStorageRoot
    const testFileSigningSecret = config.testFileSigningSecret
    const test =
      testPool && testStorageRoot && testFileSigningSecret && testSessions
        ? buildRealm({
            pool: testPool,
            storageRoot: testStorageRoot,
            signingSecret: testFileSigningSecret,
            realmSessions: testSessions,
          })
        : null

    const fileRealms: FileRouteRealms = {
      prod: {
        storage: prod.storage,
        registry: prod.registry,
        signer: prod.signer,
        membership: prod.dependencies.membership,
      },
      ...(test
        ? {
            test: {
              storage: test.storage,
              registry: test.registry,
              signer: test.signer,
              membership: test.dependencies.membership,
            },
          }
        : {}),
    }

    const testAccess = new TestAccessStore(pool)
    const reviewRouter = test
      ? createReviewRouter({
          access: testAccess,
          membership: prod.dependencies.membership,
          testSessions: testSessions!,
          ttlMilliseconds: config.testAccessTtlHours * 60 * 60 * 1000,
        })
      : async (
          _event: ApiEvent,
          _context: RequestContext,
        ): Promise<ApiResponse> => ({
          ok: false,
          error: {
            code: 'TEST_ACCESS_UNAVAILABLE',
            message: '服务端未配置测试环境',
          },
        })

    const wechat = overrides.wechat ?? new HttpWeChatAuthClient(credentials)
    const authenticate =
      overrides.authenticate ??
      (testSessions
        ? createRealmAuthenticator({
            prod: sessions,
            test: testSessions,
            testPrefix: testSessionTokenPrefix,
          })
        : createBearerAuthenticator(sessions))

    const server = createHttpApi({
      route: createRealmDispatch(
        prod.router,
        test ? test.router : null,
        reviewRouter,
      ),
      authenticate,
      checkHealth: async () => {
        await pool.query('SELECT 1')
      },
      rateLimits: overrides.rateLimits ?? {
        // 登录换取会话：每 IP 每分钟 10 次，限制 code2Session 放大攻击
        authSessionPerMinute: 10,
        // 业务接口整体兜底：每 IP 每分钟 120 次，覆盖 bootstrapOwner 口令爆破
        apiPerMinute: 120,
        // 测试口令入口单独收紧，抵抗口令爆破
        extra: { '/auth/test-session': 5, '/auth/test-access': 30 },
      },
      routes: [
        createSessionRoute({
          sessions,
          wechat,
          membership: prod.dependencies.membership,
        }),
        createTestAccessStatusRoute({
          access: testAccess,
          available: async () => {
            if (!testPool || !test) {
              return false
            }
            try {
              await testPool.query('SELECT 1')
              return true
            } catch (error) {
              console.error(error)
              return false
            }
          },
        }),
        ...(test && testSessions
          ? [
              createTestSessionRoute({
                service: createTestSessionService({
                  access: testAccess,
                  membership: test.dependencies.membership,
                  sessions: testSessions,
                }),
              }),
            ]
          : []),
        createLogoutRoute({
          prod: sessions,
          ...(testSessions ? { test: testSessions } : {}),
          testPrefix: testSessionTokenPrefix,
        }),
        ...createFileRoutes({
          realms: fileRealms,
          authenticate,
          uploadTtlMilliseconds: config.uploadUrlTtlSeconds * 1000,
        }),
        ...(overrides.routes ?? []),
      ],
    })

    const port = await listen(server, config.port)

    return {
      server,
      pool,
      port,
      close: async () => {
        const stopped = Promise.withResolvers<void>()
        server.close((error) =>
          error ? stopped.reject(error) : stopped.resolve(),
        )
        server.closeIdleConnections()
        await stopped.promise
        await pool.end()
        if (testPool) {
          await testPool.end()
        }
      },
    }
  } catch (error) {
    await pool.end()
    if (testPool) {
      await testPool.end()
    }
    throw error
  }
}
