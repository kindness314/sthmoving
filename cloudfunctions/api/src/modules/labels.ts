import type { ApiDependencies } from '../dependencies'
import { ApiException } from '../errors'
import { LabelService } from '../labels/service'
import type { ApiHandler } from '../types'

function createService(deps: ApiDependencies): LabelService {
  return new LabelService(
    deps.labels,
    deps.miniProgramCode,
    deps.labelFiles,
    deps.miniProgramEnvironment,
    undefined,
    undefined,
    deps.resolveFileUrl,
  )
}

export function createLabelHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
    get: async (payload, context) =>
      createService(deps).get(context.userId, getItemId(payload)),
    generateMiniProgramCode: async (payload, context) =>
      createService(deps).generate(context.userId, getItemId(payload)),
    resolve: async (payload, context) => {
      const scene = (payload as { scene?: unknown } | undefined)?.scene
      if (typeof scene !== 'string') {
        throw new ApiException(
          'INVALID_REQUEST',
          '标签解析请求字段无效',
        )
      }
      return createService(deps).resolve(context.userId, scene)
    },
  }
}

function getItemId(payload: unknown): string {
  const itemId = (payload as { itemId?: unknown } | undefined)?.itemId
  if (typeof itemId !== 'string') {
    throw new ApiException(
      'INVALID_REQUEST',
      '小程序码请求字段无效',
    )
  }
  return itemId
}
