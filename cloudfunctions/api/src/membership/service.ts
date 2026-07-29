import { createHash, randomUUID } from 'node:crypto'

import { ApiException } from '../errors'
import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from './repository'
import type {
  AccessState,
  AuthSession,
  JoinRequestRecord,
  PendingJoinRequest,
  PublicUser,
  UserRecord,
} from './types'

type ReviewDecision = 'APPROVE' | 'REJECT'

export interface ReviewInput {
  requestId: string
  decision: ReviewDecision
  comment?: string
}

export class MembershipService {
  constructor(
    private readonly repository: MembershipRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createRequestId: () => string = randomUUID,
  ) {}

  async login(openid: string): Promise<AuthSession> {
    const userId = getUserId(openid)

    return this.repository.runTransaction(async (unitOfWork) => {
      let user = await unitOfWork.getUser(userId)
      if (!user) {
        const now = this.now()
        user = {
          _id: userId,
          openid,
          display_name: '微信用户',
          role: 'MEMBER',
          status: 'PENDING',
          created_at: now,
          updated_at: now,
        }
        await unitOfWork.setUser(user)
      }

      assertMatchingOpenid(user, openid)
      return this.buildSession(unitOfWork, user)
    })
  }

  async submitJoinRequest(
    openid: string,
    displayNameInput: string,
  ): Promise<AuthSession> {
    const displayName = validateDisplayName(displayNameInput)
    const userId = getUserId(openid)

    return this.repository.runTransaction(async (unitOfWork) => {
      const now = this.now()
      let user = await unitOfWork.getUser(userId)
      if (!user) {
        user = {
          _id: userId,
          openid,
          display_name: displayName,
          role: 'MEMBER',
          status: 'PENDING',
          created_at: now,
          updated_at: now,
        }
      } else {
        assertMatchingOpenid(user, openid)
      }

      if (user.status === 'APPROVED') {
        throw new ApiException('ALREADY_APPROVED', '当前账号已通过审核')
      }
      if (user.status === 'DISABLED') {
        throw new ApiException('ACCOUNT_DISABLED', '当前账号已被停用')
      }

      const existing =
        await unitOfWork.findPendingJoinRequest(user._id)
      if (existing) {
        throw new ApiException(
          'JOIN_REQUEST_PENDING',
          '已有一条待审核申请，请勿重复提交',
        )
      }

      const updatedUser: UserRecord = {
        ...user,
        display_name: displayName,
        role: 'MEMBER',
        status: 'PENDING',
        updated_at: now,
      }
      await unitOfWork.setUser(updatedUser)

      await unitOfWork.setJoinRequest({
        _id: this.createRequestId(),
        applicant_id: user._id,
        display_name: displayName,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      })

      return this.buildSession(unitOfWork, updatedUser)
    })
  }

  async bootstrapOwner(openid: string): Promise<AuthSession> {
    const userId = getUserId(openid)

    return this.repository.runTransaction(async (unitOfWork) => {
      if ((await unitOfWork.countOwners()) > 0) {
        throw new ApiException(
          'OWNER_BOOTSTRAP_CLOSED',
          '首位所有者已经初始化',
        )
      }

      const now = this.now()
      const existing = await unitOfWork.getUser(userId)
      if (existing) {
        assertMatchingOpenid(existing, openid)
      }

      const owner: UserRecord = {
        _id: userId,
        openid,
        display_name: existing?.display_name ?? '所有者',
        role: 'OWNER',
        status: 'APPROVED',
        reviewed_by: userId,
        reviewed_at: now,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      }
      await unitOfWork.setUser(owner)

      const pending = await unitOfWork.findPendingJoinRequest(userId)
      if (pending) {
        await unitOfWork.setJoinRequest({
          ...pending,
          status: 'APPROVED',
          review_comment: '首位所有者初始化',
          reviewed_by: userId,
          reviewed_at: now,
          updated_at: now,
        })
      }

      return {
        user: toPublicUser(owner),
        accessState: 'APPROVED',
      }
    })
  }

  async listPendingJoinRequests(
    openid: string,
  ): Promise<PendingJoinRequest[]> {
    const reviewerId = getUserId(openid)

    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUser(reviewerId)
      requireReviewer(reviewer, openid)

      const requests = await unitOfWork.listPendingJoinRequests(50)
      const result: PendingJoinRequest[] = []
      for (const request of requests) {
        const applicant = await unitOfWork.getUser(request.applicant_id)
        if (applicant) {
          result.push({
            id: request._id,
            applicant: toPublicUser(applicant),
            displayName: request.display_name,
            createdAt: request.created_at,
          })
        }
      }
      return result
    })
  }

  async reviewJoinRequest(
    openid: string,
    input: ReviewInput,
  ): Promise<PendingJoinRequest> {
    const reviewerId = getUserId(openid)
    const comment = validateReviewComment(input.comment)

    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUser(reviewerId)
      requireReviewer(reviewer, openid)

      const request = await unitOfWork.getJoinRequest(input.requestId)
      if (!request) {
        throw new ApiException('JOIN_REQUEST_NOT_FOUND', '加入申请不存在')
      }
      if (request.status !== 'PENDING') {
        throw new ApiException(
          'JOIN_REQUEST_REVIEWED',
          '该加入申请已经处理',
        )
      }
      if (request.applicant_id === reviewerId) {
        throw new ApiException(
          'SELF_REVIEW_FORBIDDEN',
          '不能审核自己的加入申请',
        )
      }

      const applicant = await unitOfWork.getUser(request.applicant_id)
      if (!applicant) {
        throw new ApiException('APPLICANT_NOT_FOUND', '申请人账号不存在')
      }

      const now = this.now()
      const approved = input.decision === 'APPROVE'
      const requestStatus = approved ? 'APPROVED' : 'REJECTED'
      const userStatus = approved ? 'APPROVED' : 'REJECTED'

      const reviewedRequest: JoinRequestRecord = {
        ...request,
        status: requestStatus,
        ...(comment ? { review_comment: comment } : {}),
        reviewed_by: reviewerId,
        reviewed_at: now,
        updated_at: now,
      }
      await unitOfWork.setJoinRequest(reviewedRequest)
      await unitOfWork.setUser({
        ...applicant,
        role: 'MEMBER',
        status: userStatus,
        reviewed_by: reviewerId,
        reviewed_at: now,
        updated_at: now,
      })

      return {
        id: reviewedRequest._id,
        applicant: toPublicUser({
          ...applicant,
          role: 'MEMBER',
          status: userStatus,
          reviewed_by: reviewerId,
          reviewed_at: now,
          updated_at: now,
        }),
        displayName: reviewedRequest.display_name,
        createdAt: reviewedRequest.created_at,
      }
    })
  }

  private async buildSession(
    unitOfWork: MembershipUnitOfWork,
    user: UserRecord,
  ): Promise<AuthSession> {
    let accessState: AccessState = user.status
    if (user.status === 'PENDING') {
      const pending =
        await unitOfWork.findPendingJoinRequest(user._id)
      accessState = pending ? 'PENDING' : 'UNAPPLIED'
    }
    return {
      user: toPublicUser(user),
      accessState,
    }
  }
}

function getUserId(openid: string): string {
  return createHash('sha256').update(openid).digest('hex').slice(0, 32)
}

function assertMatchingOpenid(user: UserRecord, openid: string): void {
  if (user.openid !== openid) {
    throw new ApiException('IDENTITY_CONFLICT', '微信身份映射发生冲突')
  }
}

function requireReviewer(
  user: UserRecord | null,
  openid: string,
): asserts user is UserRecord {
  if (!user) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  assertMatchingOpenid(user, openid)
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') {
    throw new ApiException('FORBIDDEN', '只有管理员可以审核成员')
  }
}

function validateDisplayName(value: string): string {
  const displayName = value.trim()
  if (displayName.length < 1 || displayName.length > 40) {
    throw new ApiException(
      'INVALID_DISPLAY_NAME',
      '申请人名称长度应为 1 至 40 个字符',
    )
  }
  return displayName
}

function validateReviewComment(value: string | undefined): string | undefined {
  const comment = value?.trim()
  if (comment && comment.length > 200) {
    throw new ApiException(
      'INVALID_REVIEW_COMMENT',
      '审核意见不能超过 200 个字符',
    )
  }
  return comment || undefined
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user._id,
    displayName: user.display_name,
    ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }
}
