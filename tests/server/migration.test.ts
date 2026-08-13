import { describe, expect, it } from 'vitest'

import { deriveUserId } from '../../cloudfunctions/api/src/identity'
import { checkDataset, findOrphans } from '../../server/src/migration/check'
import type { RawDataset } from '../../server/src/migration/dataset'
import {
  emptyRawDataset,
  parseJsonLines,
} from '../../server/src/migration/dataset'
import {
  applyFileRewrites,
  digestOf,
  extensionOf,
  planFileMigration,
} from '../../server/src/migration/files'
import { compareCounts } from '../../server/src/migration/import'

const ownerId = deriveUserId('openid-owner')
const memberId = deriveUserId('openid-member')

function user(id: string, openid: string, overrides: object = {}) {
  return {
    _id: id,
    openid,
    display_name: '成员',
    role: 'MEMBER',
    status: 'APPROVED',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

function category(id: string, overrides: object = {}) {
  return {
    _id: id,
    name: '活动器材',
    normalized_name: `n-${id}`,
    status: 'ACTIVE',
    is_preset: false,
    sort_order: 1000,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

function item(id: string, code: string, overrides: object = {}) {
  return {
    _id: id,
    code,
    name: '折叠桌',
    images: [],
    description: '',
    quantity_mode: 'SINGLE',
    quantity: 1,
    category_id: 'category-1',
    status: 'ACTIVE',
    version: 1,
    registered_by: ownerId,
    registered_at: '2026-07-30T00:00:00.000Z',
    updated_by: ownerId,
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

function baseline(): RawDataset {
  return {
    ...emptyRawDataset(),
    users: [user(ownerId, 'openid-owner', { role: 'OWNER' })],
    categories: [category('category-1')],
    items: [item('item-1', 'A1B2C3D4E5F6')],
  }
}

describe('导出文件解析', () => {
  it('忽略空行并逐行解析', () => {
    expect(parseJsonLines('{"a":1}\n\n  {"b":2}  \n')).toEqual([
      { a: 1 },
      { b: 2 },
    ])
  })

  it('遇到非法 JSON 时指出行号', () => {
    expect(() => parseJsonLines('{"a":1}\n{oops}')).toThrow('第 2 行')
  })
})

describe('导出数据校验', () => {
  it('接受合法数据', () => {
    const { dataset, problems } = checkDataset(baseline())
    expect(problems).toEqual([])
    expect(dataset.users).toHaveLength(1)
    expect(dataset.items).toHaveLength(1)
  })

  it('拒绝非法枚举与时间', () => {
    const raw = baseline()
    raw.users = [user(ownerId, 'openid-owner', { role: 'BOSS' })]
    raw.categories = [category('category-1', { created_at: '不是时间' })]
    const { problems } = checkDataset(raw)
    expect(problems.map((problem) => problem.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('role'),
        expect.stringContaining('created_at'),
      ]),
    )
  })

  it('拒绝超长字段与非法物品编号', () => {
    const raw = baseline()
    raw.users = [
      user(ownerId, 'openid-owner', {
        role: 'OWNER',
        display_name: '名'.repeat(41),
      }),
    ]
    raw.items = [item('item-1', 'zzz')]
    const { problems } = checkDataset(raw)
    expect(problems).toHaveLength(2)
  })

  it('拒绝单件物品数量不为一', () => {
    const raw = baseline()
    raw.items = [item('item-1', 'A1B2C3D4E5F6', { quantity: 3 })]
    const { problems } = checkDataset(raw)
    expect(problems[0]?.reason).toContain('单件物品')
  })

  it('发现用户标识与 openid 不匹配', () => {
    const raw = baseline()
    raw.users = [user('手写的标识', 'openid-owner', { role: 'OWNER' })]
    const { problems } = checkDataset(raw)
    expect(problems[0]?.reason).toContain('AppID')
  })

  it('发现重复导出的同一用户', () => {
    const raw = baseline()
    raw.users = [
      user(ownerId, 'openid-owner', { role: 'OWNER' }),
      user(ownerId, 'openid-owner', { role: 'OWNER' }),
    ]
    const { problems } = checkDataset(raw)
    expect(problems.map((problem) => problem.reason)).toEqual(
      expect.arrayContaining(['_id 重复', 'openid 重复', '存在多个所有者']),
    )
  })

  it('发现多个所有者', () => {
    const raw = baseline()
    raw.users = [
      user(ownerId, 'openid-owner', { role: 'OWNER' }),
      user(memberId, 'openid-member', { role: 'OWNER' }),
    ]
    const { problems } = checkDataset(raw)
    expect(problems.map((problem) => problem.reason)).toEqual([
      '存在多个所有者',
    ])
  })

  it('发现重复的物品编号', () => {
    const raw = baseline()
    raw.items = [
      item('item-1', 'A1B2C3D4E5F6'),
      item('item-2', 'A1B2C3D4E5F6'),
    ]
    const { problems } = checkDataset(raw)
    expect(problems.map((problem) => problem.reason)).toContain('code 重复')
  })

  it('发现同一物品的多条待审离库申请', () => {
    const raw = baseline()
    raw.outbound_requests = [1, 2].map((index) => ({
      _id: `outbound-${index}`,
      item_id: 'item-1',
      applicant_id: ownerId,
      reason: '活动使用',
      status: 'PENDING',
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T00:00:00.000Z',
    }))
    const { problems } = checkDataset(raw)
    expect(problems.map((problem) => problem.reason)).toContain(
      '同一物品存在多条待审离库申请',
    )
  })

  it('允许已删除分类与存活分类同名', () => {
    const raw = baseline()
    raw.categories = [
      category('category-1', { normalized_name: '活动器材' }),
      category('category-2', {
        normalized_name: '活动器材',
        status: 'DELETED',
      }),
    ]
    expect(checkDataset(raw).problems).toEqual([])
  })

  it('发现指向不存在物品的标签与日志', () => {
    const raw = baseline()
    raw.item_labels = [
      {
        _id: 'label-1',
        item_id: 'item-缺失',
        public_code: 'A1B2C3D4E5F6',
        page: 'pages/item-detail/index',
        scene: 'i=A1B2C3D4E5F6',
        status: 'READY',
        attempt_count: 1,
        created_at: '2026-07-30T00:00:00.000Z',
        updated_at: '2026-07-30T00:00:00.000Z',
      },
    ]
    raw.item_operation_logs = [
      {
        _id: 'log-1',
        item_id: 'item-缺失',
        operator_id: ownerId,
        action_type: 'CREATE',
        commit_summary: '首次登记',
        version_before: 0,
        version_after: 1,
        created_at: '2026-07-30T00:00:00.000Z',
      },
    ]
    const { problems } = checkDataset(raw)
    expect(problems).toHaveLength(2)
    expect(problems.every((problem) => problem.reason.includes('item_id'))).toBe(
      true,
    )
  })

  it('孤儿检测独立可用', () => {
    const { dataset } = checkDataset(baseline())
    expect(findOrphans(dataset)).toEqual([])
    expect(
      findOrphans({
        ...dataset,
        items: [{ ...dataset.items[0]!, category_id: 'category-缺失' }],
      }),
    ).toHaveLength(1)
  })
})

describe('云存储文件搬迁计划', () => {
  const avatar = 'cloud://env.abc/avatars/x/1.PNG'
  const image = 'cloud://env.abc/items/1-a-0.jpg'
  const labelFile = 'cloud://env.abc/labels/item-1/A1B2C3D4E5F6.png'

  function datasetWithFiles() {
    const raw = baseline()
    raw.users = [
      user(ownerId, 'openid-owner', { role: 'OWNER', avatar_url: avatar }),
    ]
    raw.items = [item('item-1', 'A1B2C3D4E5F6', { images: [image, image] })]
    raw.item_labels = [
      {
        _id: 'label-1',
        item_id: 'item-1',
        public_code: 'A1B2C3D4E5F6',
        page: 'pages/item-detail/index',
        scene: 'i=A1B2C3D4E5F6',
        file_id: labelFile,
        status: 'READY',
        attempt_count: 1,
        created_at: '2026-07-30T00:00:00.000Z',
        updated_at: '2026-07-30T00:00:00.000Z',
      },
    ]
    return checkDataset(raw)
  }

  it('按用途生成路径并去重', () => {
    const { dataset, problems } = datasetWithFiles()
    expect(problems).toEqual([])

    const plan = planFileMigration(dataset)
    expect(plan.files).toHaveLength(3)
    expect(plan.files.map((file) => file.purpose).sort()).toEqual([
      'AVATAR',
      'ITEM_IMAGE',
      'LABEL',
    ])
    expect(plan.rewrites.get(avatar)).toBe(
      `file://avatars/${ownerId}/${digestOf(avatar)}.png`,
    )
    expect(plan.rewrites.get(image)).toBe(
      `file://items/${ownerId}/${digestOf(image)}.jpg`,
    )
    expect(plan.rewrites.get(labelFile)).toBe(
      'file://labels/item-1/A1B2C3D4E5F6.png',
    )
  })

  it('同一份导出重复生成的路径完全一致', () => {
    const { dataset } = datasetWithFiles()
    expect([...planFileMigration(dataset).rewrites]).toEqual([
      ...planFileMigration(dataset).rewrites,
    ])
  })

  it('无法识别的扩展名按 JPEG 处理', () => {
    expect(extensionOf('cloud://env.abc/items/a.heic')).toBe('jpg')
    expect(extensionOf('cloud://env.abc/items/a')).toBe('jpg')
    expect(extensionOf('cloud://env.abc/items/a.WEBP')).toBe('webp')
  })

  it('重写数据集中的全部文件引用', () => {
    const { dataset } = datasetWithFiles()
    const plan = planFileMigration(dataset)
    const rewritten = applyFileRewrites(dataset, plan.rewrites)

    expect(rewritten.users[0]?.avatar_url?.startsWith('file://avatars/')).toBe(
      true,
    )
    expect(rewritten.items[0]?.images.every((id) => id.startsWith('file://'))).toBe(
      true,
    )
    expect(rewritten.item_labels[0]?.file_id).toBe(
      'file://labels/item-1/A1B2C3D4E5F6.png',
    )
  })
})

describe('数量校验', () => {
  it('逐个集合比对数量', () => {
    const expected = {
      users: 2,
      join_requests: 0,
      categories: 1,
      items: 3,
      item_labels: 3,
      item_operation_logs: 5,
      outbound_requests: 0,
    }
    expect(compareCounts(expected, expected)).toEqual([])
    expect(compareCounts(expected, { ...expected, items: 2 })).toEqual([
      { collection: 'items', expected: 3, actual: 2 },
    ])
  })
})
