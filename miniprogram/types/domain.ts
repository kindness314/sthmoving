export type UserRole = 'OWNER' | 'MANAGER' | 'ADMIN' | 'MEMBER'

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

export type LabelStatus = 'PENDING' | 'READY' | 'FAILED' | 'VOID'

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
  requestedRole: 'ADMIN' | 'MEMBER'
  approvedRole?: 'ADMIN' | 'MEMBER'
  createdAt: string
}

export interface PublicMember extends User {
  reviewedBy?: string
  reviewedAt?: string
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

export interface ItemCategorySummary {
  id: string
  name: string
  status: 'ACTIVE' | 'DISABLED'
}

export interface ItemActor {
  id: string
  displayName: string
}

export interface ItemSummary {
  id: string
  code: string
  name: string
  images: string[]
  description: string
  quantityMode: QuantityMode
  quantity: number
  category: ItemCategorySummary
  status: ItemStatus
  version: number
  updatedAt: string
}

export interface ItemDetail extends ItemSummary {
  imageFileIds: string[]
  version: number
  registeredBy: ItemActor
  registeredAt: string
  updatedBy: ItemActor
}

export interface ItemListCursor {
  updatedAt: string
  id: string
}

export interface ItemListResult {
  items: ItemSummary[]
  nextCursor?: ItemListCursor
}

export interface ItemLabel {
  itemId: string
  publicCode: string
  page: 'pages/item-detail/index'
  scene: string
  status: LabelStatus
  attemptCount: number
  fileId?: string
  fileUrl?: string
  errorMessage?: string
  generatedAt?: string
  updatedAt: string
}

export interface ItemOperationLog {
  id: string
  itemId: string
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'OUTBOUND_REQUEST'
    | 'OUTBOUND_APPROVE'
    | 'OUTBOUND_REJECT'
    | 'OUTBOUND'
    | 'INBOUND'
  summary: string
  operator: ItemActor
  operatedAt: string
  itemVersion: number
}

export interface OutboundRequest {
  id: string
  itemId: string
  applicantId: string
  reason: string
  status: OutboundRequestStatus
  updatedAt: string
  applicant?: ItemActor
  item?: {
    id: string
    code: string
    name: string
    status: ItemStatus
    version: number
  }
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
