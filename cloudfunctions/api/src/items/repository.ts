import type { CategoryRecord } from '../categories/types'
import type { ItemLabelRecord } from '../labels/types'
import type { UserRecord } from '../membership/types'
import type {
  ItemListQuery,
  ItemOperationLogRecord,
  ItemRecord,
} from './types'

export interface ItemUnitOfWork {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  getCategory(categoryId: string): Promise<CategoryRecord | null>
  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null>
  getItem(itemId: string): Promise<ItemRecord | null>
  setCategory(category: CategoryRecord): Promise<void>
  setItem(item: ItemRecord): Promise<void>
  setLabel(label: ItemLabelRecord): Promise<void>
  setOperationLog(log: ItemOperationLogRecord): Promise<void>
}

export interface ItemRepository {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  getCategory(categoryId: string): Promise<CategoryRecord | null>
  getCategoriesByIds(categoryIds: string[]): Promise<CategoryRecord[]>
  getUsersByIds(userIds: string[]): Promise<UserRecord[]>
  getItem(itemId: string): Promise<ItemRecord | null>
  listOperationLogs(itemId: string): Promise<ItemOperationLogRecord[]>
  listItems(query: ItemListQuery): Promise<ItemRecord[]>
  runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T>
}
