import cloud from 'wx-server-sdk'

import type { UserRecord } from '../membership/types'
import type { ItemLabelRecord } from '../labels/types'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../items/types'
import type {
  OutboundRepository,
  OutboundUnitOfWork,
} from './repository'
import type { OutboundRequestRecord } from './types'

interface QueryResult {
  data: unknown[]
}

interface DocumentReference {
  set(options: { data: object }): Promise<unknown>
  remove(): Promise<unknown>
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

class CloudOutboundUnitOfWork implements OutboundUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { _id: userId })
  }

  async getItem(itemId: string): Promise<ItemRecord | null> {
    const item = await this.getFirst<ItemRecord>('items', { _id: itemId })
    return item && item.status !== 'DELETED' ? item : null
  }

  getRequest(requestId: string): Promise<OutboundRequestRecord | null> {
    return this.getFirst<OutboundRequestRecord>('outbound_requests', {
      _id: requestId,
    })
  }

  findPendingRequest(
    itemId: string,
  ): Promise<OutboundRequestRecord | null> {
    return this.getFirst<OutboundRequestRecord>('outbound_requests', {
      item_id: itemId,
      status: 'PENDING',
    })
  }

  async listPendingRequests(
    limit: number,
  ): Promise<OutboundRequestRecord[]> {
    const result = await this.database
      .collection('outbound_requests')
      .where({ status: 'PENDING' })
      .limit(limit)
      .get()
    return sortByCreatedAt(result.data as OutboundRequestRecord[])
  }

  async listRequestsByApplicant(
    applicantId: string,
    limit: number,
  ): Promise<OutboundRequestRecord[]> {
    const result = await this.database
      .collection('outbound_requests')
      .where({ applicant_id: applicantId })
      .limit(limit)
      .get()
    return sortByCreatedAt(result.data as OutboundRequestRecord[])
  }


  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    return this.getFirst<ItemLabelRecord>('item_labels', {
      item_id: itemId,
    })
  }

  async setItem(item: ItemRecord): Promise<void> {
    const { _id, ...data } = item
    await this.database.collection('items').doc(_id).set({ data })
  }

  async setRequest(request: OutboundRequestRecord): Promise<void> {
    const { _id, ...data } = request
    await this.database
      .collection('outbound_requests')
      .doc(_id)
      .set({ data })
  }

  async setLabel(label: ItemLabelRecord): Promise<void> {
    const { _id, ...data } = label
    await this.database.collection('item_labels').doc(_id).set({ data })
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

function sortByCreatedAt(
  requests: OutboundRequestRecord[],
): OutboundRequestRecord[] {
  return requests.sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      right._id.localeCompare(left._id),
  )
}

export class CloudOutboundRepository implements OutboundRepository {
  private readonly database = cloud.database() as unknown as TransactionDatabase

  runTransaction<T>(
    operation: (unitOfWork: OutboundUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudOutboundUnitOfWork(transaction)),
    )
  }
}
