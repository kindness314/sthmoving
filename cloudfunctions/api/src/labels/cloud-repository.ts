import cloud from 'wx-server-sdk'

import type { ItemRecord } from '../items/types'
import type { UserRecord } from '../membership/types'
import type {
  LabelRepository,
  LabelUnitOfWork,
} from './repository'
import type { ItemLabelRecord } from './types'

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

class CloudLabelUnitOfWork implements LabelUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { openid })
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return this.getFirst<ItemRecord>('items', { _id: itemId })
  }

  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    return this.getFirst<ItemLabelRecord>('item_labels', {
      item_id: itemId,
    })
  }

  getLabelByPublicCode(
    publicCode: string,
  ): Promise<ItemLabelRecord | null> {
    return this.getFirst<ItemLabelRecord>('item_labels', {
      public_code: publicCode,
    })
  }

  async setLabel(label: ItemLabelRecord): Promise<void> {
    const { _id, ...data } = label
    await this.database
      .collection('item_labels')
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

export class CloudLabelRepository implements LabelRepository {
  private readonly database =
    cloud.database() as unknown as TransactionDatabase

  runTransaction<T>(
    operation: (unitOfWork: LabelUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudLabelUnitOfWork(transaction)),
    )
  }
}
