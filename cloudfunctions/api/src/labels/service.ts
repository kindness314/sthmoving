import { randomUUID } from 'node:crypto'

import { ApiException } from '../errors'
import type { UserRecord } from '../membership/types'
import type {
  LabelFileStorage,
  MiniProgramCodeGenerator,
  MiniProgramEnvironment,
} from './external'
import type {
  LabelRepository,
} from './repository'
import type {
  ItemLabelRecord,
  PublicItemLabel,
  ResolvedItemLabel,
} from './types'

const labelPage = 'pages/item-detail/index' as const

export class LabelService {
  constructor(
    private readonly repository: LabelRepository,
    private readonly generator: MiniProgramCodeGenerator,
    private readonly storage: LabelFileStorage,
    private readonly environment: MiniProgramEnvironment = 'develop',
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createGenerationToken: () => string = randomUUID,
    private readonly resolveFileUrl: (fileId: string) => Promise<string> =
      async (fileId) => fileId,
  ) {}

  async get(
    openid: string,
    itemIdInput: string,
  ): Promise<PublicItemLabel | null> {
    const itemId = validateItemId(itemIdInput)
    const label = await this.repository.runTransaction(async (unitOfWork) => {
      requireApprovedUser(
        await unitOfWork.getUserByOpenid(openid),
        openid,
      )
      if (!(await unitOfWork.getItem(itemId))) {
        throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
      }
      return unitOfWork.getLabelByItemId(itemId)
    })
    return label ? this.toPublicItemLabel(label) : null
  }

  async generate(
    openid: string,
    itemIdInput: string,
  ): Promise<PublicItemLabel> {
    const itemId = validateItemId(itemIdInput)
    const generationToken = this.createGenerationToken()
    const label = await this.repository.runTransaction(
      async (unitOfWork) => {
        const user = await unitOfWork.getUserByOpenid(openid)
        requireApprovedUser(user, openid)
        const item = await unitOfWork.getItem(itemId)
        if (!item) {
          throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
        }
        const existing = await unitOfWork.getLabelByItemId(itemId)
        if (existing?.status === 'READY') {
          return existing
        }
        if (existing && existing.public_code !== item.code) {
          throw new ApiException(
            'LABEL_DATA_INVALID',
            '标签编码与物品编码不一致',
          )
        }

        const now = this.now()
        const pending: ItemLabelRecord = {
          _id: existing?._id ?? `item-label-${item._id}`,
          item_id: item._id,
          public_code: item.code,
          page: labelPage,
          scene: createScene(item.code),
          status: 'PENDING',
          attempt_count: (existing?.attempt_count ?? 0) + 1,
          generation_token: generationToken,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        }
        await unitOfWork.setLabel(pending)
        return pending
      },
    )

    if (label.status === 'READY') {
      return this.toPublicItemLabel(label)
    }

    try {
      const content = await this.generator.generate({
        page: label.page,
        scene: label.scene,
        environment: this.environment,
      })
      const fileId = await this.storage.upload(
        label.item_id,
        label.public_code,
        content,
      )
      return this.finishGeneration(label.item_id, generationToken, {
        fileId,
      })
    } catch (error) {
      return this.finishGeneration(label.item_id, generationToken, {
        error,
      })
    }
  }

  resolve(
    openid: string,
    sceneInput: string,
  ): Promise<ResolvedItemLabel> {
    return this.repository.runTransaction(async (unitOfWork) => {
      requireApprovedUser(
        await unitOfWork.getUserByOpenid(openid),
        openid,
      )
      const publicCode = parseScene(sceneInput)
      const label = await unitOfWork.getLabelByPublicCode(publicCode)
      if (!label || label.status !== 'READY') {
        throw new ApiException(
          'LABEL_NOT_FOUND',
          '无法识别该物品标签',
        )
      }
      const item = await unitOfWork.getItem(label.item_id)
      if (!item || item.code !== label.public_code) {
        throw new ApiException(
          'LABEL_DATA_INVALID',
          '标签绑定的物品不存在',
        )
      }
      return { itemId: item._id }
    })
  }

  private async finishGeneration(
    itemId: string,
    generationToken: string,
    result: { fileId: string } | { error: unknown },
  ): Promise<PublicItemLabel> {
    const label = await this.repository.runTransaction(async (unitOfWork) => {
      const label = await unitOfWork.getLabelByItemId(itemId)
      if (!label) {
        throw new ApiException(
          'LABEL_NOT_FOUND',
          '小程序码记录不存在',
        )
      }
      if (label.generation_token !== generationToken) {
        return label
      }

      const now = this.now()
      const updated: ItemLabelRecord =
        'fileId' in result
          ? {
              ...label,
              file_id: result.fileId,
              status: 'READY',
              generated_at: now,
              updated_at: now,
            }
          : {
              ...label,
              status: 'FAILED',
              error_code: getErrorCode(result.error),
              error_message: getErrorMessage(result.error),
              updated_at: now,
            }
      await unitOfWork.setLabel(updated)
      return updated
    })
    return this.toPublicItemLabel(label)
  }

  private async toPublicItemLabel(
    label: ItemLabelRecord,
  ): Promise<PublicItemLabel> {
    const publicLabel = toPublicItemLabel(label)
    if (!label.file_id) {
      return publicLabel
    }
    return {
      ...publicLabel,
      fileUrl: await this.resolveFileUrl(label.file_id),
    }
  }
}

export function createPendingItemLabel(
  itemId: string,
  publicCode: string,
  now: string,
): ItemLabelRecord {
  return {
    _id: `item-label-${itemId}`,
    item_id: itemId,
    public_code: publicCode,
    page: labelPage,
    scene: createScene(publicCode),
    status: 'PENDING',
    attempt_count: 0,
    created_at: now,
    updated_at: now,
  }
}

function createScene(publicCode: string): string {
  if (!/^[A-F0-9]{12}$/.test(publicCode)) {
    throw new ApiException(
      'INVALID_PUBLIC_CODE',
      '物品公开编码不符合小程序码规则',
    )
  }
  return `i=${publicCode}`
}

function parseScene(value: string): string {
  const scene = value.trim()
  const match = /^i=([A-F0-9]{12})$/.exec(scene)
  if (!match?.[1]) {
    throw new ApiException(
      'INVALID_LABEL_SCENE',
      '无法识别该物品标签',
    )
  }
  return match[1]
}

function validateItemId(value: string): string {
  const itemId = value.trim()
  if (!itemId || itemId.length > 100) {
    throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
  }
  return itemId
}

function requireApprovedUser(
  user: UserRecord | null,
  openid: string,
): asserts user is UserRecord {
  if (!user || user.openid !== openid) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const value =
      'errCode' in error
        ? error.errCode
        : 'errcode' in error
          ? error.errcode
          : undefined
    if (typeof value === 'number' || typeof value === 'string') {
      return String(value)
    }
  }
  return 'GENERATION_FAILED'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 300)
  }
  if (typeof error === 'object' && error !== null) {
    const value =
      'errMsg' in error
        ? error.errMsg
        : 'errmsg' in error
          ? error.errmsg
          : undefined
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 300)
    }
  }
  return '微信小程序码生成或保存失败'
}

function toPublicItemLabel(label: ItemLabelRecord): PublicItemLabel {
  return {
    itemId: label.item_id,
    publicCode: label.public_code,
    page: label.page,
    scene: label.scene,
    status: label.status,
    attemptCount: label.attempt_count,
    ...(label.file_id ? { fileId: label.file_id } : {}),
    ...(label.error_message
      ? { errorMessage: label.error_message }
      : {}),
    ...(label.generated_at
      ? { generatedAt: label.generated_at }
      : {}),
    updatedAt: label.updated_at,
  }
}
