import type { CategoryRecord } from '../categories/types'
import type { UserRecord } from '../membership/types'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from './types'

export interface ItemUnitOfWork {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  getCategory(categoryId: string): Promise<CategoryRecord | null>
  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null>
  setCategory(category: CategoryRecord): Promise<void>
  setItem(item: ItemRecord): Promise<void>
  setOperationLog(log: ItemOperationLogRecord): Promise<void>
}

export interface ItemRepository {
  runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T>
}
