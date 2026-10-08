export type QuantityMode = 'SINGLE' | 'MULTIPLE'
export type ItemStatus =
  | 'ACTIVE'
  | 'OUTBOUND_PENDING'
  | 'OFF_SHELF'
  | 'DELETED'

export type OfficeCode = '503' | '102' | '103'

export const OFFICE_CODES: readonly OfficeCode[] = ['503', '102', '103']

export interface ItemRecord {
  _id: string
  code: string
  name: string
  images: string[]
  description: string
  quantity_mode: QuantityMode
  quantity: number
  office: OfficeCode
  category_id: string
  status: ItemStatus
  version: number
  owner_id?: string | undefined
  donor_id?: string | undefined
  registered_by: string
  registered_at: string
  updated_by: string
  updated_at: string
  off_shelf_by?: string | undefined
  off_shelf_at?: string | undefined
  deleted_by?: string | undefined
  deleted_at?: string | undefined
}

export interface ItemOperationLogRecord {
  _id: string
  item_id: string
  operator_id: string
  action_type:
    | 'CREATE'
    | 'UPDATE'
    | 'OUTBOUND_REQUEST'
    | 'OUTBOUND_APPROVE'
    | 'OUTBOUND_REJECT'
    | 'OUTBOUND'
    | 'INBOUND'
  commit_summary: string
  version_before: number
  version_after: number
  created_at: string
}

export interface PublicItemOperationLog {
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
  operator: {
    id: string
    displayName: string
  }
  operatedAt: string
  itemVersion: number
}

export interface CreateItemInput {
  name: string
  images: string[]
  description: string
  quantityMode: QuantityMode
  quantity: number
  office: OfficeCode
  ownerId?: string
  donorId?: string
  categoryId?: string
  newCategoryName?: string
  commitSummary: string
}

export interface UpdateItemInput {
  itemId: string
  expectedVersion: number
  name?: string
  images?: string[]
  description?: string
  quantityMode?: QuantityMode
  quantity?: number
  office?: OfficeCode
  ownerId?: string | null
  donorId?: string | null
  categoryId?: string
  commitSummary: string
}

export interface ItemListCursor {
  updatedAt: string
  id: string
}

export interface ListItemsInput {
  keyword?: string
  categoryId?: string
  cursor?: ItemListCursor
  limit?: number
  status?: ItemStatus
  ownership?: ItemOwnershipFilter
  ownershipUserId?: string
}

export interface ItemListQuery {
  keyword?: string
  categoryId?: string
  cursor?: ItemListCursor
  limit: number
  status?: ItemStatus
  ownership?: ItemOwnershipFilter
  ownershipUserId?: string
}

export type ItemOwnershipFilter = 'PUBLIC' | 'PRIVATE'

export interface PublicItem {
  id: string
  code: string
  name: string
  images: string[]
  description: string
  quantityMode: QuantityMode
  quantity: number
  categoryId: string
  status: ItemStatus
  version: number
  office: OfficeCode
  ownerId?: string
  donorId?: string
  registeredBy: string
  registeredAt: string
  updatedBy: string
  updatedAt: string
}

export interface PublicItemCategory {
  id: string
  name: string
  status: CategoryRecordStatus
}

type CategoryRecordStatus = 'ACTIVE' | 'DISABLED' | 'DELETED'

export interface PublicItemActor {
  id: string
  displayName: string
}

export interface PublicItemSummary {
  id: string
  code: string
  name: string
  images: string[]
  description: string
  quantityMode: QuantityMode
  quantity: number
  category: PublicItemCategory
  status: ItemStatus
  version: number
  office: OfficeCode
  owner?: PublicItemActor
  donor?: PublicItemActor
  updatedAt: string
}

export interface PublicItemDetail extends PublicItemSummary {
  imageFileIds: string[]
  version: number
  registeredBy: PublicItemActor
  registeredAt: string
  updatedBy: PublicItemActor
}

export interface PublicItemList {
  items: PublicItemSummary[]
  nextCursor?: ItemListCursor
}
