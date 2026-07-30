import type {
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
  categoryId: string
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
