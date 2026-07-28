import type { UserRole } from '../types/domain'

export type Permission =
  | 'ITEM_CREATE'
  | 'ITEM_EDIT'
  | 'ITEM_VIEW'
  | 'ITEM_LOG_VIEW'
  | 'OUTBOUND_REQUEST_CREATE'
  | 'OUTBOUND_REVIEW'
  | 'OUTBOUND_DIRECT'
  | 'CATEGORY_CREATE'
  | 'MEMBER_REVIEW'
  | 'MEMBER_DISABLE'
  | 'ADMIN_MANAGE'

const permissionsByRole: Record<UserRole, ReadonlySet<Permission>> = {
  MEMBER: new Set([
    'ITEM_CREATE',
    'ITEM_EDIT',
    'ITEM_VIEW',
    'ITEM_LOG_VIEW',
    'OUTBOUND_REQUEST_CREATE',
    'CATEGORY_CREATE',
  ]),
  ADMIN: new Set([
    'ITEM_CREATE',
    'ITEM_EDIT',
    'ITEM_VIEW',
    'ITEM_LOG_VIEW',
    'OUTBOUND_REQUEST_CREATE',
    'OUTBOUND_REVIEW',
    'OUTBOUND_DIRECT',
    'CATEGORY_CREATE',
    'MEMBER_REVIEW',
    'MEMBER_DISABLE',
  ]),
  OWNER: new Set([
    'ITEM_CREATE',
    'ITEM_EDIT',
    'ITEM_VIEW',
    'ITEM_LOG_VIEW',
    'OUTBOUND_REQUEST_CREATE',
    'OUTBOUND_REVIEW',
    'OUTBOUND_DIRECT',
    'CATEGORY_CREATE',
    'MEMBER_REVIEW',
    'MEMBER_DISABLE',
    'ADMIN_MANAGE',
  ]),
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionsByRole[role].has(permission)
}
