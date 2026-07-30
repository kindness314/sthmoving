import cloud from 'wx-server-sdk'

import type { UserRecord } from '../membership/types'
import type {
  CategoryRepository,
  CategoryUnitOfWork,
} from './repository'
import type { CategoryRecord } from './types'

interface QueryResult {
  data: unknown[]
}

interface DocumentReference {
  set(options: { data: object }): Promise<unknown>
}

interface Query {
  where(condition: object): Query
  limit(max: number): Query
  skip(offset: number): Query
  get(): Promise<QueryResult>
}

interface Collection extends Query {
  doc(id: string): DocumentReference
}

interface TransactionDatabase {
  collection(name: string): Collection
  runTransaction<T>(
    operation: (transaction: TransactionDatabase) => Promise<T>,
  ): Promise<T>
}

class CloudCategoryUnitOfWork implements CategoryUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { openid })
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return this.getFirst<CategoryRecord>('categories', { _id: categoryId })
  }

  async setCategory(category: CategoryRecord): Promise<void> {
    const { _id, ...data } = category
    await this.database
      .collection('categories')
      .doc(_id)
      .set({ data })
  }

  async listActiveCategories(): Promise<CategoryRecord[]> {
    const categories: CategoryRecord[] = []
    const pageSize = 100
    let offset = 0

    while (true) {
      const result = await this.database
        .collection('categories')
        .where({ status: 'ACTIVE' })
        .skip(offset)
        .limit(pageSize)
        .get()
      categories.push(...(result.data as CategoryRecord[]))
      if (result.data.length < pageSize) {
        return categories
      }
      offset += pageSize
    }
  }

  private async getFirst<TRecord>(
    collection: string,
    condition: object,
  ): Promise<TRecord | null> {
    const result = await this.database
      .collection(collection)
      .where(condition)
      .limit(1)
      .get()
    return (result.data[0] as TRecord | undefined) ?? null
  }
}

export class CloudCategoryRepository implements CategoryRepository {
  private readonly database = cloud.database() as unknown as TransactionDatabase

  runTransaction<T>(
    operation: (unitOfWork: CategoryUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudCategoryUnitOfWork(transaction)),
    )
  }
}
