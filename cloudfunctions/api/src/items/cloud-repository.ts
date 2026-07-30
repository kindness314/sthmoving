import cloud from 'wx-server-sdk'

import type { CategoryRecord } from '../categories/types'
import type { ItemLabelRecord } from '../labels/types'
import type { UserRecord } from '../membership/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from './repository'
import type {
  ItemListQuery,
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
  orderBy(fieldPath: string, order: 'asc' | 'desc'): Query
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

interface DatabaseCommand {
  in(values: unknown[]): object
  lt(value: unknown): object
  and(...conditions: object[]): object
  or(...conditions: object[]): object
}

interface CloudDatabase extends TransactionDatabase {
  command: DatabaseCommand
  RegExp(options: { regexp: string; options?: string }): object
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

  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    return this.getFirst<CategoryRecord>('categories', {
      normalized_name: normalizedName,
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

  async setLabel(label: ItemLabelRecord): Promise<void> {
    const { _id, ...data } = label
    await this.database
      .collection('item_labels')
      .doc(_id)
      .set({ data })
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
  private readonly database = cloud.database() as unknown as CloudDatabase

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { openid })
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return this.getFirst<CategoryRecord>('categories', {
      _id: categoryId,
    })
  }

  getCategoriesByIds(categoryIds: string[]): Promise<CategoryRecord[]> {
    return this.getManyByIds<CategoryRecord>('categories', categoryIds)
  }

  getUsersByIds(userIds: string[]): Promise<UserRecord[]> {
    return this.getManyByIds<UserRecord>('users', userIds)
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return this.getFirst<ItemRecord>('items', { _id: itemId })
  }

  async listItems(query: ItemListQuery): Promise<ItemRecord[]> {
    const command = this.database.command
    const conditions: object[] = [
      { status: command.in(['ACTIVE', 'OUTBOUND_PENDING']) },
    ]
    if (query.categoryId) {
      conditions.push({ category_id: query.categoryId })
    }
    if (query.keyword) {
      const keyword = this.database.RegExp({
        regexp: escapeRegExp(query.keyword),
        options: 'i',
      })
      conditions.push(
        command.or(
          { name: keyword },
          { description: keyword },
          { code: keyword },
        ),
      )
    }
    if (query.cursor) {
      conditions.push(
        command.or(
          { updated_at: command.lt(query.cursor.updatedAt) },
          command.and(
            { updated_at: query.cursor.updatedAt },
            { _id: command.lt(query.cursor.id) },
          ),
        ),
      )
    }

    const condition =
      conditions.length === 1
        ? conditions[0]!
        : command.and(...conditions)
    const result = await this.database
      .collection('items')
      .where(condition)
      .orderBy('updated_at', 'desc')
      .orderBy('_id', 'desc')
      .limit(query.limit)
      .get()
    return result.data as ItemRecord[]
  }

  runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudItemUnitOfWork(transaction)),
    )
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

  private async getManyByIds<TRecord>(
    collection: string,
    ids: string[],
  ): Promise<TRecord[]> {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) {
      return []
    }
    const result = await this.database
      .collection(collection)
      .where({ _id: this.database.command.in(uniqueIds) })
      .limit(uniqueIds.length)
      .get()
    return result.data as TRecord[]
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
