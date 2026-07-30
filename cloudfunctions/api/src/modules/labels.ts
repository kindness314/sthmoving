import { ApiException } from '../errors'
import { CloudLabelRepository } from '../labels/cloud-repository'
import {
  CloudLabelFileStorage,
  WeChatMiniProgramCodeGenerator,
} from '../labels/external'
import { LabelService } from '../labels/service'
import type { ApiHandler } from '../types'

const miniProgramCodeEnvironment = 'develop' as const

function createService(): LabelService {
  return new LabelService(
    new CloudLabelRepository(),
    new WeChatMiniProgramCodeGenerator(),
    new CloudLabelFileStorage(),
    miniProgramCodeEnvironment,
  )
}

export const labelHandlers: Readonly<Record<string, ApiHandler>> = {
  get: async (payload, context) =>
    createService().get(context.openid, getItemId(payload)),
  generateMiniProgramCode: async (payload, context) =>
    createService().generate(context.openid, getItemId(payload)),
  resolve: async (payload, context) => {
    const scene = (payload as { scene?: unknown } | undefined)?.scene
    if (typeof scene !== 'string') {
      throw new ApiException(
        'INVALID_REQUEST',
        '标签解析请求字段无效',
      )
    }
    return createService().resolve(context.openid, scene)
  },
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
