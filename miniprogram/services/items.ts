import type {
  ItemDetail,
  ItemListCursor,
  ItemListResult,
  ItemOperationLog,
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
  status?: ItemStatus
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

export function listItemLogs(
  itemId: string,
): Promise<ItemOperationLog[]> {
  return callApi<{ itemId: string }, ItemOperationLog[]>({
    module: 'items',
    action: 'logs',
    payload: { itemId },
  })
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

export function updateItemCategory(input: {
  itemId: string
  expectedVersion: number
  categoryId: string
  commitSummary: string
}): Promise<CreatedItem> {
  return updateItem(input)
}

export function updateItem(input: UpdateItemInput): Promise<CreatedItem> {
  return callApi<UpdateItemInput, CreatedItem>({
    module: 'items',
    action: 'update',
    payload: input,
  })
}
