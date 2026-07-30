import type {
  ItemDetail,
  ItemListCursor,
  ItemListResult,
  ItemStatus,
  QuantityMode,
} from '../types/domain'
import { callApi } from './cloud-api'

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

export interface CreatedItem {
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

export function createItem(input: CreateItemInput): Promise<CreatedItem> {
  return callApi<CreateItemInput, CreatedItem>({
    module: 'items',
    action: 'create',
    payload: input,
  })
}

export interface ListItemsInput {
  keyword?: string
  categoryId?: string
  cursor?: ItemListCursor
  limit?: number
}

export function listItems(
  input: ListItemsInput,
): Promise<ItemListResult> {
  return callApi<ListItemsInput, ItemListResult>({
    module: 'items',
    action: 'list',
    payload: input,
  })
}

export function getItemDetail(itemId: string): Promise<ItemDetail> {
  return callApi<{ itemId: string }, ItemDetail>({
    module: 'items',
    action: 'detail',
    payload: { itemId },
  })
}
