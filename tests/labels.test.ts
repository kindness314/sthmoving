import { describe, expect, it } from 'vitest'

import type {
  GenerateMiniProgramCodeInput,
  LabelFileStorage,
  MiniProgramCodeGenerator,
} from '../cloudfunctions/api/src/labels/external'
import { extractMiniProgramCodeBuffer } from '../cloudfunctions/api/src/labels/external'
import type {
  LabelRepository,
  LabelUnitOfWork,
} from '../cloudfunctions/api/src/labels/repository'
import {
  createPendingItemLabel,
  LabelService,
} from '../cloudfunctions/api/src/labels/service'
import type { ItemLabelRecord } from '../cloudfunctions/api/src/labels/types'
import type { ItemRecord } from '../cloudfunctions/api/src/items/types'
import type { UserRecord } from '../cloudfunctions/api/src/membership/types'

class InMemoryLabelRepository implements LabelRepository {
  items = new Map<string, ItemRecord>()
  labels = new Map<string, ItemLabelRecord>()
  users = new Map<string, UserRecord>()

  async runTransaction<T>(
    operation: (unitOfWork: LabelUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const labels = cloneMap(this.labels)
    const result = await operation(
      new InMemoryLabelUnitOfWork(this.users, this.items, labels),
    )
    this.labels = labels
    return result
  }
}

class InMemoryLabelUnitOfWork implements LabelUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly items: Map<string, ItemRecord>,
    private readonly labels: Map<string, ItemLabelRecord>,
  ) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.openid === openid) ??
        null,
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(this.items.get(itemId) ?? null)
  }

  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    return Promise.resolve(
      [...this.labels.values()].find(
        (label) => label.item_id === itemId,
      ) ?? null,
    )
  }

  getLabelByPublicCode(
    publicCode: string,
  ): Promise<ItemLabelRecord | null> {
    return Promise.resolve(
      [...this.labels.values()].find(
        (label) => label.public_code === publicCode,
      ) ?? null,
    )
  }

  setLabel(label: ItemLabelRecord): Promise<void> {
    this.labels.set(label._id, structuredClone(label))
    return Promise.resolve()
  }
}

class FakeGenerator implements MiniProgramCodeGenerator {
  calls: GenerateMiniProgramCodeInput[] = []
  error: Error | null = null

  generate(input: GenerateMiniProgramCodeInput): Promise<Buffer> {
    this.calls.push(structuredClone(input))
    if (this.error) {
      return Promise.reject(this.error)
    }
    return Promise.resolve(Buffer.from('png-content'))
  }
}

class FakeStorage implements LabelFileStorage {
  uploads: Array<{
    itemId: string
    publicCode: string
    content: Buffer
  }> = []

  upload(
    itemId: string,
    publicCode: string,
    content: Buffer,
  ): Promise<string> {
    this.uploads.push({ itemId, publicCode, content })
    return Promise.resolve(
      `cloud://env/labels/${itemId}/${publicCode}.png`,
    )
  }
}

function cloneMap<TValue>(source: Map<string, TValue>): Map<string, TValue> {
  return new Map(
    [...source.entries()].map(([key, value]) => [
      key,
      structuredClone(value),
    ]),
  )
}

function createUser(
  status: UserRecord['status'] = 'APPROVED',
): UserRecord {
  return {
    _id: 'user-member',
    openid: 'member-openid',
    display_name: '成员',
    role: 'MEMBER',
    status,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function createItem(): ItemRecord {
  return {
    _id: 'item-1',
    code: 'A1B2C3D4E5F6',
    name: '折叠桌',
    images: [],
    description: '活动使用',
    quantity_mode: 'SINGLE',
    quantity: 1,
    category_id: 'category-daily',
    status: 'ACTIVE',
    version: 1,
    registered_by: 'user-member',
    registered_at: '2026-07-30T00:00:00.000Z',
    updated_by: 'user-member',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function prepare() {
  const repository = new InMemoryLabelRepository()
  repository.users.set('user-member', createUser())
  repository.items.set('item-1', createItem())
  const generator = new FakeGenerator()
  const storage = new FakeStorage()
  let nowIndex = 0
  const times = [
    '2026-07-30T01:00:00.000Z',
    '2026-07-30T01:01:00.000Z',
    '2026-07-30T01:02:00.000Z',
    '2026-07-30T01:03:00.000Z',
  ]
  const service = new LabelService(
    repository,
    generator,
    storage,
    'develop',
    () => times[nowIndex++] ?? times[times.length - 1]!,
    () => `generation-${nowIndex}`,
  )
  return { repository, generator, storage, service }
}

function prepareWithFileUrlResolver() {
  const prepared = prepare()
  const service = new LabelService(
    prepared.repository,
    prepared.generator,
    prepared.storage,
    'develop',
    () => '2026-07-30T01:00:00.000Z',
    () => 'generation-1',
    (fileId) => Promise.resolve(`https://storage.example/${fileId}`),
  )
  return { ...prepared, service }
}

async function expectApiCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code })
}

describe('物品小程序码服务', () => {
  it('从 wx-server-sdk 云调用响应中提取图片 Buffer', () => {
    const buffer = Buffer.from('png-content')
    expect(
      extractMiniProgramCodeBuffer({
        contentType: 'image/png',
        buffer,
        errCode: 0,
        errMsg: 'openapi.wxacode.getUnlimited:ok',
      }),
    ).toBe(buffer)
    expect(() =>
      extractMiniProgramCodeBuffer({ contentType: 'image/png' }),
    ).toThrow('微信接口未返回小程序码图片')
  })

  it('生成开发版原始 PNG、上传云存储并更新为 READY', async () => {
    const { repository, generator, storage, service } = prepare()
    repository.labels.set(
      'item-label-item-1',
      createPendingItemLabel(
        'item-1',
        'A1B2C3D4E5F6',
        '2026-07-30T00:00:00.000Z',
      ),
    )

    await expect(
      service.generate('member-openid', 'item-1'),
    ).resolves.toMatchObject({
      itemId: 'item-1',
      publicCode: 'A1B2C3D4E5F6',
      scene: 'i=A1B2C3D4E5F6',
      status: 'READY',
      attemptCount: 1,
      fileId:
        'cloud://env/labels/item-1/A1B2C3D4E5F6.png',
    })
    expect(generator.calls).toEqual([
      {
        page: 'pages/item-detail/index',
        scene: 'i=A1B2C3D4E5F6',
        environment: 'develop',
      },
    ])
    expect(storage.uploads).toHaveLength(1)
    expect(storage.uploads[0]?.content.toString()).toBe('png-content')
  })

  it('READY 标签重复请求直接返回，不重复调用微信接口', async () => {
    const { generator, service } = prepare()

    const first = await service.generate('member-openid', 'item-1')
    const second = await service.generate('member-openid', 'item-1')

    expect(first.status).toBe('READY')
    expect(second).toEqual(first)
    expect(generator.calls).toHaveLength(1)
  })

  it('失败时保留 FAILED 状态并可复用原编码重试', async () => {
    const { generator, service } = prepare()
    generator.error = new Error('微信接口不可用')

    const failed = await service.generate('member-openid', 'item-1')
    expect(failed).toMatchObject({
      status: 'FAILED',
      publicCode: 'A1B2C3D4E5F6',
      attemptCount: 1,
      errorMessage: '微信接口不可用',
    })

    generator.error = null
    const retried = await service.generate('member-openid', 'item-1')
    expect(retried).toMatchObject({
      status: 'READY',
      publicCode: 'A1B2C3D4E5F6',
      attemptCount: 2,
    })
    expect(generator.calls).toHaveLength(2)
  })

  it('为阶段 3 以前登记的物品补建唯一标签记录', async () => {
    const { repository, service } = prepare()
    expect(repository.labels.size).toBe(0)

    await service.generate('member-openid', 'item-1')

    expect(repository.labels.size).toBe(1)
    expect(repository.labels.get('item-label-item-1')).toMatchObject({
      item_id: 'item-1',
      public_code: 'A1B2C3D4E5F6',
      status: 'READY',
    })
  })

  it('解析 READY 或 VOID 标签，并拒绝无效 scene 和未审核账号', async () => {
    const { repository, service } = prepare()
    await service.generate('member-openid', 'item-1')

    await expect(
      service.resolve('member-openid', 'i=A1B2C3D4E5F6'),
    ).resolves.toEqual({ itemId: 'item-1' })
    const label = repository.labels.get('item-label-item-1')
    if (!label) {
      throw new Error('测试标签缺失')
    }
    repository.labels.set('item-label-item-1', {
      ...label,
      status: 'VOID',
    })
    repository.items.set('item-1', {
      ...repository.items.get('item-1')!,
      status: 'OFF_SHELF',
    })
    await expectApiCode(
      service.resolve('member-openid', 'i=A1B2C3D4E5F6'),
      'ITEM_OFF_SHELF',
    )
    await expectApiCode(
      service.get('member-openid', 'item-1'),
      'ITEM_OFF_SHELF',
    )
    await expectApiCode(
      service.generate('member-openid', 'item-1'),
      'LABEL_VOID',
    )
    repository.items.delete('item-1')
    await expectApiCode(
      service.resolve('member-openid', 'i=A1B2C3D4E5F6'),
      'ITEM_DELETED',
    )
    await expectApiCode(
      service.resolve('member-openid', 'item-1'),
      'INVALID_LABEL_SCENE',
    )

    repository.users.set('user-member', createUser('PENDING'))
    await expectApiCode(
      service.get('member-openid', 'item-1'),
      'ACCOUNT_NOT_ACTIVE',
    )
    await expectApiCode(
      service.generate('member-openid', 'item-1'),
      'ACCOUNT_NOT_ACTIVE',
    )
  })

  it('returns a temporary URL for the generated label file', async () => {
    const { service } = prepareWithFileUrlResolver()

    await expect(
      service.generate('member-openid', 'item-1'),
    ).resolves.toMatchObject({
      status: 'READY',
      fileId: 'cloud://env/labels/item-1/A1B2C3D4E5F6.png',
      fileUrl:
        'https://storage.example/cloud://env/labels/item-1/A1B2C3D4E5F6.png',
    })
  })
})
