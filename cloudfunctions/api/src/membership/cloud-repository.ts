import cloud from 'wx-server-sdk'

import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from './repository'
import type { JoinRequestRecord, UserRecord } from './types'

interface QueryResult {
  data: unknown[]
}

interface DocumentReference {
  set(options: { data: object }): Promise<unknown>
}

interface Query {
  where(condition: object): Query
  orderBy(fieldPath: string, order: string): Query
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

class CloudMembershipUnitOfWork implements MembershipUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  async getUser(userId: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { _id: userId })
  }

  async setUser(user: UserRecord): Promise<void> {
    const { _id, ...data } = user
    await this.database.collection('users').doc(_id).set({ data })
  }

  async countOwners(): Promise<number> {
    const result = await this.database
      .collection('users')
      .where({ role: 'OWNER' })
      .limit(1)
      .get()
    return result.data.length
  }

  async findPendingJoinRequest(
    applicantId: string,
  ): Promise<JoinRequestRecord | null> {
    return this.getFirst<JoinRequestRecord>('join_requests', {
      applicant_id: applicantId,
      status: 'PENDING',
    })
  }

  async getJoinRequest(
    requestId: string,
  ): Promise<JoinRequestRecord | null> {
    return this.getFirst<JoinRequestRecord>('join_requests', {
      _id: requestId,
    })
  }

  async setJoinRequest(request: JoinRequestRecord): Promise<void> {
    const { _id, ...data } = request
    await this.database
      .collection('join_requests')
      .doc(_id)
      .set({ data })
  }

  async listPendingJoinRequests(
    limit: number,
  ): Promise<JoinRequestRecord[]> {
    const result = await this.database
      .collection('join_requests')
      .where({ status: 'PENDING' })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get()
    return result.data as JoinRequestRecord[]
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

export class CloudMembershipRepository implements MembershipRepository {
  private readonly database = cloud.database() as unknown as TransactionDatabase

  runTransaction<T>(
    operation: (unitOfWork: MembershipUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudMembershipUnitOfWork(transaction)),
    )
  }
}
