import type { UserRecord } from '../membership/types'
import type { CategoryRecord } from './types'

export interface CategoryUnitOfWork {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  getCategory(categoryId: string): Promise<CategoryRecord | null>
  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null>
  setCategory(category: CategoryRecord): Promise<void>
  listActiveCategories(): Promise<CategoryRecord[]>
  listAllCategories(): Promise<CategoryRecord[]>
}

export interface CategoryRepository {
  runTransaction<T>(
    operation: (unitOfWork: CategoryUnitOfWork) => Promise<T>,
  ): Promise<T>
}
