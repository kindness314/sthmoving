export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED'

export type AccessState =
  | 'UNAPPLIED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISABLED'

export type QuantityMode = 'SINGLE' | 'MULTIPLE'

export type ItemStatus = 'ACTIVE' | 'OUTBOUND_PENDING' | 'OFF_SHELF'

export type OutboundRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type LabelStatus = 'UNBOUND' | 'BOUND' | 'VOID'

export interface User {
  id: string
  displayName: string
  avatarUrl?: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
}

export interface AuthSession {
  user: User
  accessState: AccessState
}

export interface PendingJoinRequest {
  id: string
  applicant: User
  displayName: string
  createdAt: string
}

export interface Category {
  id: string
  name: string
  status: 'ACTIVE' | 'DISABLED'
  isPreset: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Item {
  id: string
  name: string
  description: string
  imageFileIds: string[]
  quantityMode: QuantityMode
  quantity: number
  categoryId: string
  status: ItemStatus
  labelCode: string
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface ItemOperationLog {
  id: string
  itemId: string
  action: 'CREATE' | 'UPDATE' | 'OUTBOUND'
  summary: string
  operatorId: string
  operatedAt: string
  itemVersion: number
}

export interface OutboundRequest {
  id: string
  itemId: string
  applicantId: string
  reason: string
  status: OutboundRequestStatus
  reviewerId?: string
  reviewComment?: string
  createdAt: string
  reviewedAt?: string
}

export interface ItemUpdateInput {
  itemId: string
  expectedVersion: number
  name?: string
  description?: string
  imageFileIds?: string[]
  quantityMode?: QuantityMode
  quantity?: number
  summary: string
}

export interface ItemConflict {
  latest: Item
  submitted: ItemUpdateInput
  changedFields: Array<keyof ItemUpdateInput>
}
