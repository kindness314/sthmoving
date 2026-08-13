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

interface DatabaseCommand {
  in(values: unknown[]): object
}

interface TransactionDatabase {
  command: DatabaseCommand
  collection(name: string): Collection
  runTransaction<T>(
    operation: (transaction: TransactionDatabase) => Promise<T>,
  ): Promise<T>
}

class CloudCategoryUnitOfWork implements CategoryUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { _id: userId })
  }

  async getCategory(categoryId: string): Promise<CategoryRecord | null> {
    const category = await this.getFirst<CategoryRecord>('categories', {
      _id: categoryId,
    })
    return category && category.status !== 'DELETED' ? category : null
  }

  async getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    const category = await this.getFirst<CategoryRecord>('categories', {
      normalized_name: normalizedName,
    })
    return category && category.status !== 'DELETED' ? category : null
  }

  async hasItemReference(categoryId: string): Promise<boolean> {
    const result = await this.database
      .collection('items')
      .where({
        category_id: categoryId,
        status: this.database.command.in([
          'ACTIVE',
          'OUTBOUND_PENDING',
          'OFF_SHELF',
        ]),
      })
      .limit(1)
      .get()
    return result.data.length > 0
  }

  async setCategory(category: CategoryRecord): Promise<void> {
    const { _id, ...data } = category
    await this.database
      .collection('categories')
      .doc(_id)
      .set({ data })
  }

  async listActiveCategories(): Promise<CategoryRecord[]> {
    return this.listCategories({ status: 'ACTIVE' })
  }

  async listAllCategories(): Promise<CategoryRecord[]> {
    const categories = await this.listCategories()
    return categories.filter((category) => category.status !== 'DELETED')
  }

  private async listCategories(
    condition?: object,
  ): Promise<CategoryRecord[]> {
    const categories: CategoryRecord[] = []
    const pageSize = 100
    let offset = 0

    while (true) {
      const collection = this.database.collection('categories')
      const query = condition ? collection.where(condition) : collection
      const result = await query
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
