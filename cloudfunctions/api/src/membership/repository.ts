import type { JoinRequestRecord, UserRecord } from './types'

export interface MembershipUnitOfWork {
  getUser(userId: string): Promise<UserRecord | null>
  setUser(user: UserRecord): Promise<void>
  countOwners(): Promise<number>
  countManagers(): Promise<number>
  findPendingJoinRequest(
    applicantId: string,
  ): Promise<JoinRequestRecord | null>
  getJoinRequest(requestId: string): Promise<JoinRequestRecord | null>
  setJoinRequest(request: JoinRequestRecord): Promise<void>
  listPendingJoinRequests(limit: number): Promise<JoinRequestRecord[]>
  listUsers(limit: number): Promise<UserRecord[]>
}

export interface MembershipRepository {
  runTransaction<T>(
    operation: (unitOfWork: MembershipUnitOfWork) => Promise<T>,
  ): Promise<T>
}
