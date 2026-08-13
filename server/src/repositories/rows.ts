import type { Pool, PoolClient } from 'pg'

import type { CategoryRecord } from '../../../cloudfunctions/api/src/categories/types'
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
import { optional, optionalIso, toIso } from '../db/mapping'

type Row = Record<string, never>
type Queryable = Pool | PoolClient

function read<T>(row: unknown, column: string): T {
  return (row as Record<string, T>)[column] as T
}

export function userRow(row: Row): UserRecord {
  return {
    _id: read<string>(row, 'id'),
    openid: read<string>(row, 'openid'),
    display_name: read<string>(row, 'display_name'),
    ...optional('avatar_url', read<string | null>(row, 'avatar_url')),
    gender: read<NonNullable<UserRecord['gender']>>(row, 'gender'),
    theme: read<NonNullable<UserRecord['theme']>>(row, 'theme'),
    role: read<UserRecord['role']>(row, 'role'),
    status: read<UserRecord['status']>(row, 'status'),
    ...optionalIso('joined_at', read<Date | null>(row, 'joined_at')),
    ...optional('reviewed_by', read<string | null>(row, 'reviewed_by')),
    ...optionalIso('reviewed_at', read<Date | null>(row, 'reviewed_at')),
    created_at: toIso(read<Date>(row, 'created_at')),
    updated_at: toIso(read<Date>(row, 'updated_at')),
  }
}

export async function upsertUser(
  db: Queryable,
  user: UserRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO users (id, openid, display_name, avatar_url, gender, theme,
                        role, status, joined_at, reviewed_by, reviewed_at,
                        created_at, updated_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'UNKNOWN'), COALESCE($6, 'NAVY'),
             $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       openid = EXCLUDED.openid,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       gender = EXCLUDED.gender,
       theme = EXCLUDED.theme,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       joined_at = EXCLUDED.joined_at,
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = EXCLUDED.reviewed_at,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [
      user._id,
      user.openid,
      user.display_name,
      user.avatar_url ?? null,
      user.gender ?? null,
      user.theme ?? null,
      user.role,
      user.status,
      user.joined_at ?? null,
      user.reviewed_by ?? null,
      user.reviewed_at ?? null,
      user.created_at,
      user.updated_at,
    ],
  )
}

export function joinRequestRow(row: Row): JoinRequestRecord {
  return {
    _id: read<string>(row, 'id'),
    applicant_id: read<string>(row, 'applicant_id'),
    display_name: read<string>(row, 'display_name'),
    requested_role: read<NonNullable<JoinRequestRecord['requested_role']>>(
      row,
      'requested_role',
    ),
    ...optional(
      'approved_role',
      read<NonNullable<JoinRequestRecord['approved_role']> | null>(
        row,
        'approved_role',
      ),
    ),
    status: read<JoinRequestRecord['status']>(row, 'status'),
    ...optional('review_comment', read<string | null>(row, 'review_comment')),
    ...optional('reviewed_by', read<string | null>(row, 'reviewed_by')),
    ...optionalIso('reviewed_at', read<Date | null>(row, 'reviewed_at')),
    created_at: toIso(read<Date>(row, 'created_at')),
    updated_at: toIso(read<Date>(row, 'updated_at')),
  }
}

export async function upsertJoinRequest(
  db: Queryable,
  request: JoinRequestRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO join_requests (id, applicant_id, display_name, requested_role,
                                approved_role, status, review_comment,
                                reviewed_by, reviewed_at, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, 'MEMBER'), $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       applicant_id = EXCLUDED.applicant_id,
       display_name = EXCLUDED.display_name,
       requested_role = EXCLUDED.requested_role,
       approved_role = EXCLUDED.approved_role,
       status = EXCLUDED.status,
       review_comment = EXCLUDED.review_comment,
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = EXCLUDED.reviewed_at,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [
      request._id,
      request.applicant_id,
      request.display_name,
      request.requested_role ?? null,
      request.approved_role ?? null,
      request.status,
      request.review_comment ?? null,
      request.reviewed_by ?? null,
      request.reviewed_at ?? null,
      request.created_at,
      request.updated_at,
    ],
  )
}

export function categoryRow(row: Row): CategoryRecord {
  return {
    _id: read<string>(row, 'id'),
    name: read<string>(row, 'name'),
    normalized_name: read<string>(row, 'normalized_name'),
    status: read<CategoryRecord['status']>(row, 'status'),
    is_preset: read<boolean>(row, 'is_preset'),
    sort_order: read<number>(row, 'sort_order'),
    ...optional(
      'item_reference_count',
      read<number | null>(row, 'item_reference_count'),
    ),
    ...optional('created_by', read<string | null>(row, 'created_by')),
    created_at: toIso(read<Date>(row, 'created_at')),
    updated_at: toIso(read<Date>(row, 'updated_at')),
    ...optional('deleted_by', read<string | null>(row, 'deleted_by')),
    ...optionalIso('deleted_at', read<Date | null>(row, 'deleted_at')),
  }
}

export async function upsertCategory(
  db: Queryable,
  category: CategoryRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO categories (id, name, normalized_name, status, is_preset,
                             sort_order, item_reference_count, created_by,
                             created_at, updated_at, deleted_by, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       normalized_name = EXCLUDED.normalized_name,
       status = EXCLUDED.status,
       is_preset = EXCLUDED.is_preset,
       sort_order = EXCLUDED.sort_order,
       item_reference_count = EXCLUDED.item_reference_count,
       created_by = EXCLUDED.created_by,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at,
       deleted_by = EXCLUDED.deleted_by,
       deleted_at = EXCLUDED.deleted_at`,
    [
      category._id,
      category.name,
      category.normalized_name,
      category.status,
      category.is_preset,
      category.sort_order,
      category.item_reference_count ?? null,
      category.created_by ?? null,
      category.created_at,
      category.updated_at,
      category.deleted_by ?? null,
      category.deleted_at ?? null,
    ],
  )
}

export function itemRow(row: Row): ItemRecord {
  return {
    _id: read<string>(row, 'id'),
    code: read<string>(row, 'code'),
    name: read<string>(row, 'name'),
    images: read<string[]>(row, 'images'),
    description: read<string>(row, 'description'),
    quantity_mode: read<ItemRecord['quantity_mode']>(row, 'quantity_mode'),
    quantity: read<number>(row, 'quantity'),
    category_id: read<string>(row, 'category_id'),
    status: read<ItemRecord['status']>(row, 'status'),
    version: read<number>(row, 'version'),
    registered_by: read<string>(row, 'registered_by'),
    registered_at: toIso(read<Date>(row, 'registered_at')),
    updated_by: read<string>(row, 'updated_by'),
    updated_at: toIso(read<Date>(row, 'updated_at')),
    ...optional('off_shelf_by', read<string | null>(row, 'off_shelf_by')),
    ...optionalIso('off_shelf_at', read<Date | null>(row, 'off_shelf_at')),
    ...optional('deleted_by', read<string | null>(row, 'deleted_by')),
    ...optionalIso('deleted_at', read<Date | null>(row, 'deleted_at')),
  }
}

export async function upsertItem(
  db: Queryable,
  item: ItemRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO items (id, code, name, images, description, quantity_mode,
                        quantity, category_id, status, version, registered_by,
                        registered_at, updated_by, updated_at, off_shelf_by,
                        off_shelf_at, deleted_by, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18)
     ON CONFLICT (id) DO UPDATE SET
       code = EXCLUDED.code,
       name = EXCLUDED.name,
       images = EXCLUDED.images,
       description = EXCLUDED.description,
       quantity_mode = EXCLUDED.quantity_mode,
       quantity = EXCLUDED.quantity,
       category_id = EXCLUDED.category_id,
       status = EXCLUDED.status,
       version = EXCLUDED.version,
       registered_by = EXCLUDED.registered_by,
       registered_at = EXCLUDED.registered_at,
       updated_by = EXCLUDED.updated_by,
       updated_at = EXCLUDED.updated_at,
       off_shelf_by = EXCLUDED.off_shelf_by,
       off_shelf_at = EXCLUDED.off_shelf_at,
       deleted_by = EXCLUDED.deleted_by,
       deleted_at = EXCLUDED.deleted_at`,
    [
      item._id,
      item.code,
      item.name,
      item.images,
      item.description,
      item.quantity_mode,
      item.quantity,
      item.category_id,
      item.status,
      item.version,
      item.registered_by,
      item.registered_at,
      item.updated_by,
      item.updated_at,
      item.off_shelf_by ?? null,
      item.off_shelf_at ?? null,
      item.deleted_by ?? null,
      item.deleted_at ?? null,
    ],
  )
}

export function labelRow(row: Row): ItemLabelRecord {
  return {
    _id: read<string>(row, 'id'),
    item_id: read<string>(row, 'item_id'),
    public_code: read<string>(row, 'public_code'),
    page: read<ItemLabelRecord['page']>(row, 'page'),
    scene: read<string>(row, 'scene'),
    ...optional('file_id', read<string | null>(row, 'file_id')),
    status: read<ItemLabelRecord['status']>(row, 'status'),
    ...optional(
      'status_before_void',
      read<NonNullable<ItemLabelRecord['status_before_void']> | null>(
        row,
        'status_before_void',
      ),
    ),
    attempt_count: read<number>(row, 'attempt_count'),
    ...optional(
      'generation_token',
      read<string | null>(row, 'generation_token'),
    ),
    ...optional('error_code', read<string | null>(row, 'error_code')),
    ...optional('error_message', read<string | null>(row, 'error_message')),
    ...optionalIso('generated_at', read<Date | null>(row, 'generated_at')),
    created_at: toIso(read<Date>(row, 'created_at')),
    updated_at: toIso(read<Date>(row, 'updated_at')),
  }
}

export async function upsertLabel(
  db: Queryable,
  label: ItemLabelRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO item_labels (id, item_id, public_code, page, scene, file_id,
                              status, status_before_void, attempt_count,
                              generation_token, error_code, error_message,
                              generated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET
       item_id = EXCLUDED.item_id,
       public_code = EXCLUDED.public_code,
       page = EXCLUDED.page,
       scene = EXCLUDED.scene,
       file_id = EXCLUDED.file_id,
       status = EXCLUDED.status,
       status_before_void = EXCLUDED.status_before_void,
       attempt_count = EXCLUDED.attempt_count,
       generation_token = EXCLUDED.generation_token,
       error_code = EXCLUDED.error_code,
       error_message = EXCLUDED.error_message,
       generated_at = EXCLUDED.generated_at,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [
      label._id,
      label.item_id,
      label.public_code,
      label.page,
      label.scene,
      label.file_id ?? null,
      label.status,
      label.status_before_void ?? null,
      label.attempt_count,
      label.generation_token ?? null,
      label.error_code ?? null,
      label.error_message ?? null,
      label.generated_at ?? null,
      label.created_at,
      label.updated_at,
    ],
  )
}

export function operationLogRow(row: Row): ItemOperationLogRecord {
  return {
    _id: read<string>(row, 'id'),
    item_id: read<string>(row, 'item_id'),
    operator_id: read<string>(row, 'operator_id'),
    action_type: read<ItemOperationLogRecord['action_type']>(
      row,
      'action_type',
    ),
    commit_summary: read<string>(row, 'commit_summary'),
    version_before: read<number>(row, 'version_before'),
    version_after: read<number>(row, 'version_after'),
    created_at: toIso(read<Date>(row, 'created_at')),
  }
}

export async function upsertOperationLog(
  db: Queryable,
  log: ItemOperationLogRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO item_operation_logs (id, item_id, operator_id, action_type,
                                      commit_summary, version_before,
                                      version_after, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       item_id = EXCLUDED.item_id,
       operator_id = EXCLUDED.operator_id,
       action_type = EXCLUDED.action_type,
       commit_summary = EXCLUDED.commit_summary,
       version_before = EXCLUDED.version_before,
       version_after = EXCLUDED.version_after,
       created_at = EXCLUDED.created_at`,
    [
      log._id,
      log.item_id,
      log.operator_id,
      log.action_type,
      log.commit_summary,
      log.version_before,
      log.version_after,
      log.created_at,
    ],
  )
}

export function outboundRequestRow(row: Row): OutboundRequestRecord {
  return {
    _id: read<string>(row, 'id'),
    item_id: read<string>(row, 'item_id'),
    applicant_id: read<string>(row, 'applicant_id'),
    reason: read<string>(row, 'reason'),
    status: read<OutboundRequestRecord['status']>(row, 'status'),
    ...optional('reviewer_id', read<string | null>(row, 'reviewer_id')),
    ...optional('review_summary', read<string | null>(row, 'review_summary')),
    ...optionalIso('reviewed_at', read<Date | null>(row, 'reviewed_at')),
    created_at: toIso(read<Date>(row, 'created_at')),
    updated_at: toIso(read<Date>(row, 'updated_at')),
  }
}

export async function upsertOutboundRequest(
  db: Queryable,
  request: OutboundRequestRecord,
): Promise<void> {
  await db.query(
    `INSERT INTO outbound_requests (id, item_id, applicant_id, reason, status,
                                    reviewer_id, review_summary, reviewed_at,
                                    created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       item_id = EXCLUDED.item_id,
       applicant_id = EXCLUDED.applicant_id,
       reason = EXCLUDED.reason,
       status = EXCLUDED.status,
       reviewer_id = EXCLUDED.reviewer_id,
       review_summary = EXCLUDED.review_summary,
       reviewed_at = EXCLUDED.reviewed_at,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [
      request._id,
      request.item_id,
      request.applicant_id,
      request.reason,
      request.status,
      request.reviewer_id ?? null,
      request.review_summary ?? null,
      request.reviewed_at ?? null,
      request.created_at,
      request.updated_at,
    ],
  )
}
