import { randomUUID } from 'node:crypto'

import { ApiException } from '../errors'
import {
  isAvatarOwnedBy,
  isManagedFileReference,
} from '../storage/file-reference'
import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from './repository'
import type {
  AccessState,
  AuthSession,
  JoinRequestRecord,
  PendingJoinRequest,
  PublicMember,
  PublicUser,
  UserGender,
  UserRecord,
  UserTheme,
} from './types'

type ReviewDecision = 'APPROVE' | 'REJECT'

export interface ReviewInput {
  requestId: string
  decision: ReviewDecision
  comment?: string
}

export type RequestedRole = 'ADMIN' | 'MEMBER'

export interface MemberRoleInput {
  userId: string
  role: 'ADMIN' | 'MEMBER'
}

export interface ManagerTargetInput {
  targetUserId: string
  sourceManagerId?: string
}

export interface ProfileUpdateInput {
  displayName?: string
  avatarUrl?: string
  gender?: UserGender
  theme?: UserTheme
}

export class MembershipService {
  constructor(
    private readonly repository: MembershipRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createRequestId: () => string = randomUUID,
  ) {}

  async login(userId: string, openid: string): Promise<AuthSession> {

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
    userId: string,
    openid: string,
    displayNameInput: string,
    requestedRoleInput: RequestedRole = 'MEMBER',
  ): Promise<AuthSession> {
    const displayName = validateDisplayName(displayNameInput)
    const requestedRole = validateRequestedRole(requestedRoleInput)

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

      const requestId = this.createRequestId()
      await unitOfWork.setJoinRequest({
        _id: requestId,
        applicant_id: user._id,
        display_name: displayName,
        requested_role: requestedRole,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      })

      return this.buildSession(unitOfWork, updatedUser)
    })
  }

  async bootstrapOwner(userId: string, openid: string): Promise<AuthSession> {

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
        joined_at: existing?.joined_at ?? now,
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
    userId: string,
  ): Promise<PendingJoinRequest[]> {
    const reviewerId = userId

    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUser(reviewerId)
      requireReviewer(reviewer)

      const requests = await unitOfWork.listPendingJoinRequests(50)
      const result: PendingJoinRequest[] = []
      for (const request of requests) {
        const requestedRole = request.requested_role ?? 'MEMBER'
        if (requestedRole === 'ADMIN' &&
            reviewer.role !== 'MANAGER' && reviewer.role !== 'OWNER') {
          continue
        }
        const applicant = await unitOfWork.getUser(request.applicant_id)
        if (applicant) {
          result.push({
            id: request._id,
            applicant: toPublicUser(applicant),
            displayName: request.display_name,
            requestedRole,
            ...(request.approved_role
              ? { approvedRole: request.approved_role }
              : {}),
            createdAt: request.created_at,
          })
        }
      }
      return result
    })
  }

  async reviewJoinRequest(
    userId: string,
    input: ReviewInput,
  ): Promise<PendingJoinRequest> {
    const reviewerId = userId
    const comment = validateReviewComment(input.comment, input.decision)

    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUser(reviewerId)
      requireReviewer(reviewer)

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
      if (
        (request.requested_role ?? 'MEMBER') === 'ADMIN' &&
        reviewer.role !== 'MANAGER' &&
        reviewer.role !== 'OWNER'
      ) {
        throw new ApiException(
          'FORBIDDEN',
          '只有实际管理者或所有者可以审核管理员申请',
        )
      }

      const applicant = await unitOfWork.getUser(request.applicant_id)
      if (!applicant) {
        throw new ApiException('APPLICANT_NOT_FOUND', '申请人账号不存在')
      }

      if (applicant.status !== 'PENDING') {
        throw new ApiException(
          'JOIN_APPLICANT_STATE_CONFLICT',
          '申请人的账号状态已变化，无法继续审核',
        )
      }

      const now = this.now()
      const approved = input.decision === 'APPROVE'
      const requestStatus = approved ? 'APPROVED' : 'REJECTED'
      const userStatus = approved ? 'APPROVED' : 'REJECTED'

      const reviewedRequest: JoinRequestRecord = {
        ...request,
        status: requestStatus,
        ...(approved ? { approved_role: request.requested_role ?? 'MEMBER' } : {}),
        ...(comment ? { review_comment: comment } : {}),
        reviewed_by: reviewerId,
        reviewed_at: now,
        updated_at: now,
      }
      await unitOfWork.setJoinRequest(reviewedRequest)
      await unitOfWork.setUser({
        ...applicant,
        role: approved ? request.requested_role ?? 'MEMBER' : applicant.role,
        status: userStatus,
        ...(approved ? { joined_at: applicant.joined_at ?? now } : {}),
        reviewed_by: reviewerId,
        reviewed_at: now,
        updated_at: now,
      })

      return {
        id: reviewedRequest._id,
        applicant: toPublicUser({
          ...applicant,
          role: approved ? request.requested_role ?? 'MEMBER' : applicant.role,
          status: userStatus,
          ...(approved ? { joined_at: applicant.joined_at ?? now } : {}),
          reviewed_by: reviewerId,
          reviewed_at: now,
          updated_at: now,
        }),
        displayName: reviewedRequest.display_name,
        requestedRole: reviewedRequest.requested_role ?? 'MEMBER',
        ...(reviewedRequest.approved_role
          ? { approvedRole: reviewedRequest.approved_role }
          : {}),
        createdAt: reviewedRequest.created_at,
      }
    })
  }

  async listMembers(userId: string): Promise<PublicMember[]> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const actor = await unitOfWork.getUser(userId)
      requireMemberManager(actor)
      const users = await unitOfWork.listUsers(200)
      return users.map(toPublicMember)
    })
  }

  async updateProfile(
    userId: string,
    input: ProfileUpdateInput,
  ): Promise<PublicUser> {
    const updates = validateProfileUpdate(input)
    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUser(userId)
      requireApprovedIdentity(user)
      if (
        updates.avatar_url &&
        !isAvatarOwnedBy(updates.avatar_url, user._id)
      ) {
        throw new ApiException(
          'INVALID_AVATAR_URL',
          '头像文件不属于当前账号',
        )
      }
      const updated: UserRecord = {
        ...user,
        ...updates,
        updated_at: this.now(),
      }
      await unitOfWork.setUser(updated)
      return toPublicUser(updated)
    })
  }

  async disableMember(userId: string, targetUserId: string): Promise<PublicMember> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const actor = await unitOfWork.getUser(userId)
      requireMemberManager(actor)
      const target = await getTargetUser(unitOfWork, targetUserId)
      if (target._id === actor._id) {
        throw new ApiException('SELF_MEMBER_DISABLE_FORBIDDEN', '不能停用自己的账号')
      }
      if (target.role === 'OWNER' || target.role === 'MANAGER') {
        throw new ApiException('ROLE_CHANGE_FORBIDDEN', '所有者或实际管理者不能通过成员移除操作停用')
      }
      if (target.status !== 'APPROVED') {
        throw new ApiException(
          'MEMBER_STATUS_INVALID',
          '只能停用已通过审核的成员',
        )
      }
      if (target.role === 'ADMIN' && actor.role !== 'MANAGER' && actor.role !== 'OWNER') {
        throw new ApiException('FORBIDDEN', '只有实际管理者或所有者可以停用管理员')
      }
      const now = this.now()
      const updated: UserRecord = {
        ...target,
        status: 'DISABLED',
        updated_at: now,
        reviewed_by: actor._id,
        reviewed_at: now,
      }
      await unitOfWork.setUser(updated)
      return toPublicMember(updated)
    })
  }

  async setAdminRole(userId: string, input: MemberRoleInput): Promise<PublicMember> {
    const targetUserId = validateUserId(input.userId)
    if (input.role !== 'ADMIN' && input.role !== 'MEMBER') {
      throw new ApiException('INVALID_ROLE', '只能设置普通成员或管理员角色')
    }
    return this.repository.runTransaction(async (unitOfWork) => {
      const actor = await unitOfWork.getUser(userId)
      requireManagerOrOwner(actor)
      const target = await getTargetUser(unitOfWork, targetUserId)
      if (target.status !== 'APPROVED' || target.role === 'OWNER' || target.role === 'MANAGER') {
        throw new ApiException('ROLE_CHANGE_FORBIDDEN', '只能调整已通过审核的普通成员或管理员')
      }
      const updated: UserRecord = {
        ...target,
        role: input.role,
        updated_at: this.now(),
        reviewed_by: actor._id,
        reviewed_at: this.now(),
      }
      await unitOfWork.setUser(updated)
      return toPublicMember(updated)
    })
  }

  async appointManager(userId: string, targetUserId: string): Promise<PublicMember> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const actor = await unitOfWork.getUser(userId)
      requireOwner(actor)
      const target = await getTargetUser(unitOfWork, validateUserId(targetUserId))
      if (target.status !== 'APPROVED' || target.role !== 'ADMIN') {
        throw new ApiException('MANAGER_TARGET_INVALID', '实际管理者必须从已通过审核的管理员中任命')
      }
      const updated = { ...target, role: 'MANAGER' as const, updated_at: this.now(), reviewed_by: actor._id, reviewed_at: this.now() }
      await unitOfWork.setUser(updated)
      return toPublicMember(updated)
    })
  }

  async removeManager(userId: string, targetUserId: string): Promise<PublicMember> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const actor = await unitOfWork.getUser(userId)
      requireOwner(actor)
      const target = await getTargetUser(unitOfWork, validateUserId(targetUserId))
      if (target.role !== 'MANAGER' || target.status !== 'APPROVED') {
        throw new ApiException('MANAGER_TARGET_INVALID', '目标用户不是有效的实际管理者')
      }
      if ((await unitOfWork.countManagers()) <= 1) {
        throw new ApiException('LAST_MANAGER_FORBIDDEN', '至少需要保留一名实际管理者')
      }
      const updated = { ...target, role: 'ADMIN' as const, updated_at: this.now(), reviewed_by: actor._id, reviewed_at: this.now() }
      await unitOfWork.setUser(updated)
      return toPublicMember(updated)
    })
  }

  async transferManager(userId: string, input: ManagerTargetInput): Promise<PublicMember> {
    const targetUserId = validateUserId(input.targetUserId)
    return this.repository.runTransaction(async (unitOfWork) => {
      const actor = await unitOfWork.getUser(userId)
      requireManagerOrOwner(actor)
      const sourceId = actor.role === 'MANAGER'
        ? actor._id
        : validateUserId(input.sourceManagerId ?? '')
      const source = await getTargetUser(unitOfWork, sourceId)
      if (source.role !== 'MANAGER' || source.status !== 'APPROVED') {
        throw new ApiException('MANAGER_TARGET_INVALID', '转出方不是有效的实际管理者')
      }
      const target = await getTargetUser(unitOfWork, targetUserId)
      if (target.status !== 'APPROVED' || target.role !== 'ADMIN') {
        throw new ApiException('MANAGER_TARGET_INVALID', '接任者必须是已通过审核的管理员')
      }
      const now = this.now()
      await unitOfWork.setUser({ ...source, role: 'ADMIN', updated_at: now, reviewed_by: actor._id, reviewed_at: now })
      const updatedTarget = { ...target, role: 'MANAGER' as const, updated_at: now, reviewed_by: actor._id, reviewed_at: now }
      await unitOfWork.setUser(updatedTarget)
      return toPublicMember(updatedTarget)
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

function assertMatchingOpenid(user: UserRecord, openid: string): void {
  if (user.openid !== openid) {
    throw new ApiException('IDENTITY_CONFLICT', '微信身份映射发生冲突')
  }
}

function requireReviewer(
  user: UserRecord | null,
): asserts user is UserRecord {
  if (!user) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
  if (
    user.role !== 'ADMIN' &&
    user.role !== 'MANAGER' &&
    user.role !== 'OWNER'
  ) {
    throw new ApiException('FORBIDDEN', '只有管理员可以审核成员')
  }
}

function requireMemberManager(
  user: UserRecord | null,
): asserts user is UserRecord {
  requireApprovedIdentity(user)
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'OWNER') {
    throw new ApiException('FORBIDDEN', '只有管理权限角色可以管理成员')
  }
}

function requireManagerOrOwner(
  user: UserRecord | null,
): asserts user is UserRecord {
  requireApprovedIdentity(user)
  if (user.role !== 'MANAGER' && user.role !== 'OWNER') {
    throw new ApiException('FORBIDDEN', '只有实际管理者或所有者可以执行此操作')
  }
}

function requireOwner(
  user: UserRecord | null,
): asserts user is UserRecord {
  requireApprovedIdentity(user)
  if (user.role !== 'OWNER') {
    throw new ApiException('FORBIDDEN', '只有所有者可以任免实际管理者')
  }
}

function requireApprovedIdentity(
  user: UserRecord | null,
): asserts user is UserRecord {
  if (!user) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
}

async function getTargetUser(
  unitOfWork: MembershipUnitOfWork,
  userIdInput: string,
): Promise<UserRecord> {
  const userId = validateUserId(userIdInput)
  const user = await unitOfWork.getUser(userId)
  if (!user) {
    throw new ApiException('USER_NOT_FOUND', '成员不存在')
  }
  return user
}

function validateUserId(value: string): string {
  const userId = value.trim()
  if (!userId || userId.length > 100) {
    throw new ApiException('INVALID_USER_ID', '成员 ID 无效')
  }
  return userId
}

function validateRequestedRole(value: RequestedRole): RequestedRole {
  if (value !== 'ADMIN' && value !== 'MEMBER') {
    throw new ApiException('INVALID_REQUESTED_ROLE', '申请角色只能是普通成员或管理员')
  }
  return value
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

function validateProfileUpdate(input: ProfileUpdateInput): Partial<UserRecord> {
  const updates: Partial<UserRecord> = {}
  if (input.displayName !== undefined) {
    updates.display_name = validateDisplayName(input.displayName)
  }
  if (input.avatarUrl !== undefined) {
    const avatarUrl = input.avatarUrl.trim()
    if (!isManagedFileReference(avatarUrl)) {
      throw new ApiException('INVALID_AVATAR_URL', '头像必须是有效的云存储文件')
    }
    updates.avatar_url = avatarUrl
  }
  if (input.gender !== undefined) {
    if (input.gender !== 'UNKNOWN' && input.gender !== 'FEMALE' && input.gender !== 'MALE') {
      throw new ApiException('INVALID_GENDER', '性别选项无效')
    }
    updates.gender = input.gender
  }
  if (input.theme !== undefined) {
    if (!isUserTheme(input.theme)) {
      throw new ApiException('INVALID_THEME', '主题颜色无效')
    }
    updates.theme = input.theme
  }
  if (Object.keys(updates).length === 0) {
    throw new ApiException('EMPTY_PROFILE_UPDATE', '没有需要保存的个人资料')
  }
  return updates
}

function isUserTheme(value: string): value is UserTheme {
  return [
    'NAVY',
    'TEAL',
    'BLUE',
    'PURPLE',
    'FOREST',
    'WINE',
    'SLATE',
    'COFFEE',
    'ROSE',
    'INDIGO',
    'OLIVE',
    'RUST',
  ].includes(value)
}

function validateReviewComment(
  value: string | undefined,
  decision: ReviewDecision,
): string | undefined {
  const comment = value?.trim()
  if (decision === 'REJECT' && (!comment || comment.length < 1)) {
    throw new ApiException(
      'INVALID_REVIEW_COMMENT',
      '拒绝申请时必须填写原因',
    )
  }
  if (comment && comment.length > 250) {
    throw new ApiException(
      'INVALID_REVIEW_COMMENT',
      '审核意见不能超过 250 个字符',
    )
  }
  return comment || undefined
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user._id,
    displayName: user.display_name,
    ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
    gender: user.gender ?? 'UNKNOWN',
    theme: user.theme ?? 'NAVY',
    role: user.role,
    status: user.status,
    ...(user.joined_at
      ? { joinedAt: user.joined_at }
      : user.status === 'APPROVED'
        ? { joinedAt: user.reviewed_at ?? user.created_at }
        : {}),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }
}

function toPublicMember(user: UserRecord): PublicMember {
  return {
    ...toPublicUser(user),
    ...(user.reviewed_by ? { reviewedBy: user.reviewed_by } : {}),
    ...(user.reviewed_at ? { reviewedAt: user.reviewed_at } : {}),
  }
}
