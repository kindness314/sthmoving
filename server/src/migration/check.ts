import type { CategoryRecord } from '../../../cloudfunctions/api/src/categories/types'
import { deriveUserId } from '../../../cloudfunctions/api/src/identity'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../../../cloudfunctions/api/src/items/types'
import type { ItemLabelRecord } from '../../../cloudfunctions/api/src/labels/types'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../../../cloudfunctions/api/src/membership/types'
import type { OutboundRequestRecord } from '../../../cloudfunctions/api/src/outbound/types'
import { isManagedFileReference } from '../../../cloudfunctions/api/src/storage/file-reference'
import type {
  CollectionName,
  MigrationDataset,
  MigrationProblem,
  RawDataset,
} from './dataset'
import { emptyDataset } from './dataset'

type Report = (reason: string) => void

const codePattern = /^[0-9A-F]{12}$/
const scenePattern = /^i=[0-9A-F]{12}$/

const userRoles = ['OWNER', 'MANAGER', 'ADMIN', 'MEMBER']
const userStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'DISABLED']
const genders = ['UNKNOWN', 'FEMALE', 'MALE']
const themes = [
  'NAVY', 'TEAL', 'BLUE', 'PURPLE', 'FOREST', 'WINE',
  'SLATE', 'COFFEE', 'ROSE', 'INDIGO', 'OLIVE', 'RUST',
]
const requestedRoles = ['ADMIN', 'MEMBER']
const reviewStatuses = ['PENDING', 'APPROVED', 'REJECTED']
const categoryStatuses = ['ACTIVE', 'DISABLED', 'DELETED']
const itemStatuses = ['ACTIVE', 'OUTBOUND_PENDING', 'OFF_SHELF', 'DELETED']
const quantityModes = ['SINGLE', 'MULTIPLE']
const labelStatuses = ['PENDING', 'READY', 'FAILED', 'VOID']
const labelStatusesBeforeVoid = ['PENDING', 'READY', 'FAILED']
const actionTypes = [
  'CREATE', 'UPDATE', 'OUTBOUND_REQUEST', 'OUTBOUND_APPROVE',
  'OUTBOUND_REJECT', 'OUTBOUND', 'INBOUND',
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  min: number,
  max: number,
): void {
  const value = row[field]
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    report(`${field} 必须是长度 ${min}-${max} 的字符串`)
  }
}

function optionalText(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  min: number,
  max: number,
): void {
  if (row[field] !== undefined && row[field] !== null) {
    text(row, field, report, min, max)
  }
}

function pattern(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  expected: RegExp,
): void {
  const value = row[field]
  if (typeof value !== 'string' || !expected.test(value)) {
    report(`${field} 不符合格式 ${expected.source}`)
  }
}

function oneOf(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  values: readonly string[],
): void {
  if (typeof row[field] !== 'string' || !values.includes(row[field] as string)) {
    report(`${field} 必须是 ${values.join('、')} 之一`)
  }
}

function optionalOneOf(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  values: readonly string[],
): void {
  if (row[field] !== undefined && row[field] !== null) {
    oneOf(row, field, report, values)
  }
}

function integer(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  min: number,
): void {
  const value = row[field]
  if (!Number.isInteger(value) || (value as number) < min) {
    report(`${field} 必须是不小于 ${min} 的整数`)
  }
}

function optionalInteger(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  min: number,
): void {
  if (row[field] !== undefined && row[field] !== null) {
    integer(row, field, report, min)
  }
}

function timestamp(
  row: Record<string, unknown>,
  field: string,
  report: Report,
): void {
  const value = row[field]
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    report(`${field} 必须是可解析的时间字符串`)
  }
}

function optionalTimestamp(
  row: Record<string, unknown>,
  field: string,
  report: Report,
): void {
  if (row[field] !== undefined && row[field] !== null) {
    timestamp(row, field, report)
  }
}

function boolean(
  row: Record<string, unknown>,
  field: string,
  report: Report,
): void {
  if (typeof row[field] !== 'boolean') {
    report(`${field} 必须是布尔值`)
  }
}

function fileReferences(
  row: Record<string, unknown>,
  field: string,
  report: Report,
  max: number,
): void {
  const value = row[field]
  if (!Array.isArray(value) || value.length > max) {
    report(`${field} 必须是至多 ${max} 项的数组`)
    return
  }
  if (
    value.some(
      (fileId) => typeof fileId !== 'string' || !isManagedFileReference(fileId),
    )
  ) {
    report(`${field} 含有不受管的文件引用`)
  }
}

function checkUser(row: Record<string, unknown>, report: Report): void {
  text(row, 'openid', report, 1, 200)
  if (
    typeof row['_id'] === 'string' &&
    typeof row['openid'] === 'string' &&
    row['_id'] !== deriveUserId(row['openid'])
  ) {
    report('_id 与 openid 不匹配，小程序 AppID 可能已变更')
  }
  text(row, 'display_name', report, 1, 40)
  optionalText(row, 'avatar_url', report, 1, 500)
  optionalOneOf(row, 'gender', report, genders)
  optionalOneOf(row, 'theme', report, themes)
  oneOf(row, 'role', report, userRoles)
  oneOf(row, 'status', report, userStatuses)
  optionalTimestamp(row, 'joined_at', report)
  optionalTimestamp(row, 'reviewed_at', report)
  timestamp(row, 'created_at', report)
  timestamp(row, 'updated_at', report)
}

function checkJoinRequest(row: Record<string, unknown>, report: Report): void {
  text(row, 'applicant_id', report, 1, 200)
  text(row, 'display_name', report, 1, 40)
  oneOf(row, 'requested_role', report, requestedRoles)
  optionalOneOf(row, 'approved_role', report, requestedRoles)
  oneOf(row, 'status', report, reviewStatuses)
  optionalText(row, 'review_comment', report, 1, 250)
  optionalTimestamp(row, 'reviewed_at', report)
  timestamp(row, 'created_at', report)
  timestamp(row, 'updated_at', report)
}

function checkCategory(row: Record<string, unknown>, report: Report): void {
  text(row, 'name', report, 1, 40)
  text(row, 'normalized_name', report, 1, 200)
  oneOf(row, 'status', report, categoryStatuses)
  boolean(row, 'is_preset', report)
  integer(row, 'sort_order', report, 0)
  optionalInteger(row, 'item_reference_count', report, 0)
  timestamp(row, 'created_at', report)
  timestamp(row, 'updated_at', report)
  optionalTimestamp(row, 'deleted_at', report)
}

function checkItem(row: Record<string, unknown>, report: Report): void {
  pattern(row, 'code', report, codePattern)
  text(row, 'name', report, 1, 100)
  fileReferences(row, 'images', report, 2)
  text(row, 'description', report, 0, 2000)
  oneOf(row, 'quantity_mode', report, quantityModes)
  integer(row, 'quantity', report, 1)
  if (row['quantity_mode'] === 'SINGLE' && row['quantity'] !== 1) {
    report('单件物品的数量必须是 1')
  }
  text(row, 'category_id', report, 1, 200)
  oneOf(row, 'status', report, itemStatuses)
  integer(row, 'version', report, 1)
  text(row, 'registered_by', report, 1, 200)
  timestamp(row, 'registered_at', report)
  text(row, 'updated_by', report, 1, 200)
  timestamp(row, 'updated_at', report)
  optionalTimestamp(row, 'off_shelf_at', report)
  optionalTimestamp(row, 'deleted_at', report)
}

function checkLabel(row: Record<string, unknown>, report: Report): void {
  text(row, 'item_id', report, 1, 200)
  pattern(row, 'public_code', report, codePattern)
  if (row['page'] !== 'pages/item-detail/index') {
    report('page 必须是 pages/item-detail/index')
  }
  pattern(row, 'scene', report, scenePattern)
  if (row['file_id'] !== undefined && row['file_id'] !== null) {
    optionalText(row, 'file_id', report, 1, 500)
    if (
      typeof row['file_id'] === 'string' &&
      !isManagedFileReference(row['file_id'])
    ) {
      report('file_id 不是受管的文件引用')
    }
  }
  oneOf(row, 'status', report, labelStatuses)
  optionalOneOf(row, 'status_before_void', report, labelStatusesBeforeVoid)
  integer(row, 'attempt_count', report, 0)
  optionalText(row, 'error_message', report, 1, 300)
  optionalTimestamp(row, 'generated_at', report)
  timestamp(row, 'created_at', report)
  timestamp(row, 'updated_at', report)
}

function checkOperationLog(row: Record<string, unknown>, report: Report): void {
  text(row, 'item_id', report, 1, 200)
  text(row, 'operator_id', report, 1, 200)
  oneOf(row, 'action_type', report, actionTypes)
  text(row, 'commit_summary', report, 1, 250)
  integer(row, 'version_before', report, 0)
  integer(row, 'version_after', report, 1)
  if (
    Number.isInteger(row['version_before']) &&
    Number.isInteger(row['version_after']) &&
    (row['version_after'] as number) <= (row['version_before'] as number)
  ) {
    report('version_after 必须大于 version_before')
  }
  timestamp(row, 'created_at', report)
}

function checkOutboundRequest(
  row: Record<string, unknown>,
  report: Report,
): void {
  text(row, 'item_id', report, 1, 200)
  text(row, 'applicant_id', report, 1, 200)
  text(row, 'reason', report, 1, 250)
  oneOf(row, 'status', report, reviewStatuses)
  optionalText(row, 'review_summary', report, 1, 250)
  optionalTimestamp(row, 'reviewed_at', report)
  timestamp(row, 'created_at', report)
  timestamp(row, 'updated_at', report)
}

function checkUniqueness(
  dataset: MigrationDataset,
  problems: MigrationProblem[],
): void {
  const duplicates = <T>(
    collection: CollectionName,
    records: readonly T[],
    key: (record: T) => string | null,
    reason: string,
  ) => {
    const seen = new Set<string>()
    for (const record of records) {
      const value = key(record)
      if (value === null) {
        continue
      }
      if (seen.has(value)) {
        problems.push({
          collection,
          id: (record as { _id: string })._id,
          reason,
        })
      }
      seen.add(value)
    }
  }

  duplicates('users', dataset.users, (user) => user._id, '_id 重复')
  duplicates('users', dataset.users, (user) => user.openid, 'openid 重复')
  duplicates(
    'users',
    dataset.users,
    (user) => (user.role === 'OWNER' ? 'OWNER' : null),
    '存在多个所有者',
  )
  duplicates(
    'join_requests',
    dataset.join_requests,
    (request) => request._id,
    '_id 重复',
  )
  duplicates(
    'join_requests',
    dataset.join_requests,
    (request) =>
      request.status === 'PENDING' ? request.applicant_id : null,
    '同一申请人存在多条待审申请',
  )
  duplicates(
    'categories',
    dataset.categories,
    (category) => category._id,
    '_id 重复',
  )
  duplicates(
    'categories',
    dataset.categories,
    (category) =>
      category.status === 'DELETED' ? null : category.normalized_name,
    '未删除分类的归一化名称重复',
  )
  duplicates('items', dataset.items, (item) => item._id, '_id 重复')
  duplicates('items', dataset.items, (item) => item.code, 'code 重复')
  duplicates(
    'item_labels',
    dataset.item_labels,
    (label) => label._id,
    '_id 重复',
  )
  duplicates(
    'item_labels',
    dataset.item_labels,
    (label) => label.item_id,
    '同一物品存在多个标签',
  )
  duplicates(
    'item_labels',
    dataset.item_labels,
    (label) => label.public_code,
    'public_code 重复',
  )
  duplicates(
    'item_operation_logs',
    dataset.item_operation_logs,
    (log) => log._id,
    '_id 重复',
  )
  duplicates(
    'outbound_requests',
    dataset.outbound_requests,
    (request) => request._id,
    '_id 重复',
  )
  duplicates(
    'outbound_requests',
    dataset.outbound_requests,
    (request) => (request.status === 'PENDING' ? request.item_id : null),
    '同一物品存在多条待审离库申请',
  )
}

export function findOrphans(dataset: MigrationDataset): MigrationProblem[] {
  const userIds = new Set(dataset.users.map((user) => user._id))
  const categoryIds = new Set(
    dataset.categories.map((category) => category._id),
  )
  const itemIds = new Set(dataset.items.map((item) => item._id))
  const problems: MigrationProblem[] = []

  const require = <T extends { _id: string }>(
    collection: CollectionName,
    records: readonly T[],
    field: keyof T & string,
    known: ReadonlySet<string>,
  ) => {
    for (const record of records) {
      if (!known.has(record[field] as string)) {
        problems.push({
          collection,
          id: record._id,
          reason: `${field} 指向不存在的记录 ${String(record[field])}`,
        })
      }
    }
  }

  require('join_requests', dataset.join_requests, 'applicant_id', userIds)
  require('items', dataset.items, 'category_id', categoryIds)
  require('item_labels', dataset.item_labels, 'item_id', itemIds)
  require('item_operation_logs', dataset.item_operation_logs, 'item_id', itemIds)
  require('outbound_requests', dataset.outbound_requests, 'item_id', itemIds)
  require(
    'outbound_requests',
    dataset.outbound_requests,
    'applicant_id',
    userIds,
  )
  return problems
}

export function checkDataset(raw: RawDataset): {
  dataset: MigrationDataset
  problems: MigrationProblem[]
} {
  const problems: MigrationProblem[] = []
  const dataset = emptyDataset()

  const collect = <T>(
    collection: CollectionName,
    rows: readonly unknown[],
    check: (row: Record<string, unknown>, report: Report) => void,
  ): T[] => {
    const accepted: T[] = []
    for (const [index, row] of rows.entries()) {
      if (!isObject(row)) {
        problems.push({
          collection,
          id: `#${index + 1}`,
          reason: '不是 JSON 对象',
        })
        continue
      }
      const id = typeof row['_id'] === 'string' ? row['_id'] : `#${index + 1}`
      let failed = false
      const report: Report = (reason) => {
        failed = true
        problems.push({ collection, id, reason })
      }
      text(row, '_id', report, 1, 200)
      check(row, report)
      if (!failed) {
        accepted.push(row as T)
      }
    }
    return accepted
  }

  dataset.users = collect<UserRecord>('users', raw.users, checkUser)
  dataset.join_requests = collect<JoinRequestRecord>(
    'join_requests',
    raw.join_requests,
    checkJoinRequest,
  )
  dataset.categories = collect<CategoryRecord>(
    'categories',
    raw.categories,
    checkCategory,
  )
  dataset.items = collect<ItemRecord>('items', raw.items, checkItem)
  dataset.item_labels = collect<ItemLabelRecord>(
    'item_labels',
    raw.item_labels,
    checkLabel,
  )
  dataset.item_operation_logs = collect<ItemOperationLogRecord>(
    'item_operation_logs',
    raw.item_operation_logs,
    checkOperationLog,
  )
  dataset.outbound_requests = collect<OutboundRequestRecord>(
    'outbound_requests',
    raw.outbound_requests,
    checkOutboundRequest,
  )

  checkUniqueness(dataset, problems)
  problems.push(...findOrphans(dataset))
  return { dataset, problems }
}
