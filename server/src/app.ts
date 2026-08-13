import type { IncomingMessage, Server } from 'node:http'

import type { Pool } from 'pg'

import { createRouter } from '../../cloudfunctions/api/src/router'
import type { RequestContext } from '../../cloudfunctions/api/src/types'
import { createBearerAuthenticator, createSessionRoute } from './auth/routes'
import { PostgresSessionStore } from './auth/sessions'
import type { WeChatAuthClient } from './auth/wechat'
import { HttpWeChatAuthClient } from './auth/wechat'
import type { ServerConfig } from './config'
import { migrate } from './db/migrate'
import { createPool } from './db/pool'
import type { ExternalDependencies } from './dependencies.pg'
import { createPgDependencies } from './dependencies.pg'
import type { HttpRoute } from './http/server'
import { createHttpApi } from './http/server'
import { createFileServices } from './storage/external'
import { PostgresFileRegistry } from './storage/files'
import { LocalFileStorage } from './storage/local'
import { createFileRoutes } from './storage/routes'
import { FileUrlSigner } from './storage/signing'
import { WeChatAccessTokenProvider } from './wechat/access-token'
import { HttpMiniProgramCodeGenerator } from './wechat/mini-program-code'

export interface ServerOverrides {
  authenticate?: (request: IncomingMessage) => Promise<RequestContext>
  external?: Partial<ExternalDependencies>
  routes?: readonly HttpRoute[]
  wechat?: WeChatAuthClient
}

export interface StartedServer {
  readonly server: Server
  readonly pool: Pool
  readonly port: number
  close(): Promise<void>
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(port, () => {
      server.off('error', onError)
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    })
  })
}

export async function startServer(
  config: ServerConfig,
  overrides: ServerOverrides = {},
): Promise<StartedServer> {
  const pool = createPool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
  })

  try {
    if (config.runMigrations) {
      await migrate(pool)
    }

    const storage = new LocalFileStorage(config.storageRoot)
    const registry = new PostgresFileRegistry(pool)
    const signer = new FileUrlSigner(
      config.fileSigningSecret,
      config.publicBaseUrl,
    )
    const files = createFileServices({
      storage,
      registry,
      signer,
      downloadTtlMilliseconds: config.fileUrlTtlSeconds * 1000,
    })

    const credentials = {
      appId: config.wechatAppId,
      appSecret: config.wechatAppSecret,
    }
    const accessTokens = new WeChatAccessTokenProvider(credentials)

    const dependencies = createPgDependencies(pool, {
      ...files,
      miniProgramCode: new HttpMiniProgramCodeGenerator(accessTokens),
      miniProgramEnvironment: config.miniProgramEnvironment,
      ...overrides.external,
    })
    const sessions = new PostgresSessionStore(
      pool,
      config.sessionTtlDays * 24 * 60 * 60 * 1000,
    )
    const wechat = overrides.wechat ?? new HttpWeChatAuthClient(credentials)
    const authenticate =
      overrides.authenticate ?? createBearerAuthenticator(sessions)

    const server = createHttpApi({
      route: createRouter(dependencies),
      authenticate,
      checkHealth: async () => {
        await pool.query('SELECT 1')
      },
      routes: [
        createSessionRoute({
          sessions,
          wechat,
          membership: dependencies.membership,
        }),
        ...createFileRoutes({
          storage,
          registry,
          signer,
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
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
          server.closeIdleConnections()
        })
        await pool.end()
      },
    }
  } catch (error) {
    await pool.end()
    throw error
  }
}
