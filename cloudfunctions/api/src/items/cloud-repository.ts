import cloud from 'wx-server-sdk'

import type { CategoryRecord } from '../categories/types'
import type { UserRecord } from '../membership/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from './repository'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from './types'

interface QueryResult {
  data: unknown[]
}

interface DocumentReference {
  set(options: { data: object }): Promise<unknown>
}

interface Query {
  where(condition: object): Query
  limit(max: number): Query
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

class CloudItemUnitOfWork implements ItemUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { openid })
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return this.getFirst<CategoryRecord>('categories', {
      _id: categoryId,
    })
  }

  async setCategory(category: CategoryRecord): Promise<void> {
    const { _id, ...data } = category
    await this.database
      .collection('categories')
      .doc(_id)
      .set({ data })
  }

  async setItem(item: ItemRecord): Promise<void> {
    const { _id, ...data } = item
    await this.database.collection('items').doc(_id).set({ data })
  }

  async setOperationLog(log: ItemOperationLogRecord): Promise<void> {
    const { _id, ...data } = log
    await this.database
      .collection('item_operation_logs')
      .doc(_id)
      .set({ data })
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

export class CloudItemRepository implements ItemRepository {
  private readonly database = cloud.database() as unknown as TransactionDatabase

  runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudItemUnitOfWork(transaction)),
    )
  }
}
