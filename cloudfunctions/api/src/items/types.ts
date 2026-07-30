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
}

export interface ItemOperationLogRecord {
  _id: string
  item_id: string
  operator_id: string
  action_type: 'CREATE'
  commit_summary: string
  version_before: number
  version_after: number
  created_at: string
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

export interface ItemListCursor {
  updatedAt: string
  id: string
}

export interface ListItemsInput {
  keyword?: string
  categoryId?: string
  cursor?: ItemListCursor
  limit?: number
}

export interface ItemListQuery {
  keyword?: string
  categoryId?: string
  cursor?: ItemListCursor
  limit: number
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
  updatedAt: string
}

export interface PublicItemDetail extends PublicItemSummary {
  version: number
  registeredBy: PublicItemActor
  registeredAt: string
  updatedBy: PublicItemActor
}

export interface PublicItemList {
  items: PublicItemSummary[]
  nextCursor?: ItemListCursor
}
