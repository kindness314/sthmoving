import type { CategoryRecord } from '../../cloudfunctions/api/src/categories/types'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../../cloudfunctions/api/src/items/types'
import type { ItemLabelRecord } from '../../cloudfunctions/api/src/labels/types'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../../cloudfunctions/api/src/membership/types'
import type { OutboundRequestRecord } from '../../cloudfunctions/api/src/outbound/types'

export interface SeedData {
  users?: UserRecord[]
  categories?: CategoryRecord[]
  items?: ItemRecord[]
  labels?: ItemLabelRecord[]
  operationLogs?: ItemOperationLogRecord[]
  joinRequests?: JoinRequestRecord[]
  outboundRequests?: OutboundRequestRecord[]
}

export interface RepositoryHarness<TRepository> {
  readonly name: string
  create(seed?: SeedData): Promise<TRepository>
  dispose(): Promise<void>
}

export function createUser(
  id: string,
  overrides: Partial<UserRecord> = {},
): UserRecord {
  return {
    _id: id,
    openid: `openid-${id}`,
    display_name: id,
    role: 'MEMBER',
    status: 'APPROVED',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

export function createCategory(
  id: string,
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  return {
    _id: id,
    name: id,
    normalized_name: id,
    status: 'ACTIVE',
    is_preset: false,
    sort_order: 1000,
    item_reference_count: 0,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

function codeFromId(id: string): string {
  let hash = 0
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash.toString(16).toUpperCase().padStart(12, '0').slice(-12)
}

export function createItem(
  id: string,
  overrides: Partial<ItemRecord> = {},
): ItemRecord {
  return {
    _id: id,
    code: codeFromId(id),
    name: id,
    images: [],
    description: '',
    quantity_mode: 'SINGLE',
    quantity: 1,
    category_id: 'category-1',
    status: 'ACTIVE',
    version: 1,
    registered_by: 'user-1',
    registered_at: '2026-07-30T00:00:00.000Z',
    updated_by: 'user-1',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

export function createLabel(
  itemId: string,
  overrides: Partial<ItemLabelRecord> = {},
): ItemLabelRecord {
  return {
    _id: `item-label-${itemId}`,
    item_id: itemId,
    public_code: 'A1B2C3D4E5F6',
    page: 'pages/item-detail/index',
    scene: 'i=A1B2C3D4E5F6',
    status: 'READY',
    attempt_count: 1,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

export function createOperationLog(
  id: string,
  itemId: string,
  overrides: Partial<ItemOperationLogRecord> = {},
): ItemOperationLogRecord {
  return {
    _id: id,
    item_id: itemId,
    operator_id: 'user-1',
    action_type: 'CREATE',
    commit_summary: '首次登记',
    version_before: 0,
    version_after: 1,
    created_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

export function createJoinRequest(
  id: string,
  applicantId: string,
  overrides: Partial<JoinRequestRecord> = {},
): JoinRequestRecord {
  return {
    _id: id,
    applicant_id: applicantId,
    display_name: applicantId,
    requested_role: 'MEMBER',
    status: 'PENDING',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

export function createOutboundRequest(
  id: string,
  itemId: string,
  applicantId: string,
  overrides: Partial<OutboundRequestRecord> = {},
): OutboundRequestRecord {
  return {
    _id: id,
    item_id: itemId,
    applicant_id: applicantId,
    reason: '活动使用',
    status: 'PENDING',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}
