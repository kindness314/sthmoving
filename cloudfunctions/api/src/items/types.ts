export type QuantityMode = 'SINGLE' | 'MULTIPLE'
export type ItemStatus = 'ACTIVE' | 'OUTBOUND_PENDING' | 'OFF_SHELF'

export interface ItemRecord {
  _id: string
  code: string
  name: string
  images: string[]
  description: string
  quantity_mode: QuantityMode
  quantity: number
  category_id: string
  status: ItemStatus
  version: number
  registered_by: string
  registered_at: string
  updated_by: string
  updated_at: string
  off_shelf_by?: string
  off_shelf_at?: string
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
}

export interface ItemListQuery {
  keyword?: string
  categoryId?: string
  cursor?: ItemListCursor
  limit: number
  status?: ItemStatus
}

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

type CategoryRecordStatus = 'ACTIVE' | 'DISABLED'

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
