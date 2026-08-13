import type { ApiDependencies } from '../dependencies'
import { ApiException } from '../errors'
import {
  MembershipService,
  type ProfileUpdateInput,
  type ReviewInput,
} from '../membership/service'
import type { UserTheme } from '../membership/types'
import type { ApiHandler } from '../types'

interface SubmitPayload {
  displayName?: unknown
  requestedRole?: unknown
}

interface ReviewPayload {
  requestId?: unknown
  decision?: unknown
  comment?: unknown
}

interface UserIdPayload {
  userId?: unknown
}

interface RolePayload extends UserIdPayload {
  role?: unknown
}

interface TransferManagerPayload extends UserIdPayload {
  sourceManagerId?: unknown
}

interface UpdateProfilePayload {
  displayName?: unknown
  avatarUrl?: unknown
  gender?: unknown
  theme?: unknown
}

const userThemes: ReadonlySet<UserTheme> = new Set([
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
])

function createService(deps: ApiDependencies): MembershipService {
  return new MembershipService(deps.membership)
}

function parseReviewInput(payload: unknown): ReviewInput {
  const input = payload as ReviewPayload | undefined
  if (typeof input?.requestId !== 'string' || input.requestId.length === 0) {
    throw new ApiException('INVALID_REQUEST_ID', '申请 ID 不能为空')
  }
  if (input.decision !== 'APPROVE' && input.decision !== 'REJECT') {
    throw new ApiException('INVALID_DECISION', '审核决定无效')
  }
  if (input.comment !== undefined && typeof input.comment !== 'string') {
    throw new ApiException('INVALID_REVIEW_COMMENT', '审核意见必须是字符串')
  }
  return {
    requestId: input.requestId,
    decision: input.decision,
    ...(typeof input.comment === 'string' ? { comment: input.comment } : {}),
  }
}

function parseProfileUpdate(payload: unknown): ProfileUpdateInput {
  const input = payload as UpdateProfilePayload | undefined
  const result: ProfileUpdateInput = {}
  if (input?.displayName !== undefined) {
    if (typeof input.displayName !== 'string') {
      throw new ApiException('INVALID_DISPLAY_NAME', '昵称必须是字符串')
    }
    result.displayName = input.displayName
  }
  if (input?.avatarUrl !== undefined) {
    if (typeof input.avatarUrl !== 'string') {
      throw new ApiException('INVALID_AVATAR_URL', '头像地址必须是字符串')
    }
    result.avatarUrl = input.avatarUrl
  }
  if (input?.gender !== undefined) {
    if (input.gender !== 'UNKNOWN' && input.gender !== 'FEMALE' && input.gender !== 'MALE') {
      throw new ApiException('INVALID_GENDER', '性别选项无效')
    }
    result.gender = input.gender
  }
  if (input?.theme !== undefined) {
    const theme = input.theme as UserTheme
    if (typeof input.theme !== 'string' || !userThemes.has(theme)) {
      throw new ApiException('INVALID_THEME', '主题颜色无效')
    }
    result.theme = theme
  }
  return result
}

export function createMembershipHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
    updateProfile: async (payload, context) =>
      createService(deps).updateProfile(
        context.userId,
        parseProfileUpdate(payload),
      ),

    submitJoinRequest: async (payload, context) => {
      const input = payload as SubmitPayload | undefined
      const displayName = input?.displayName
      if (typeof displayName !== 'string') {
        throw new ApiException(
          'INVALID_DISPLAY_NAME',
          '申请人名称必须是字符串',
        )
      }
      const requestedRole = input?.requestedRole ?? 'MEMBER'
      if (requestedRole !== 'MEMBER' && requestedRole !== 'ADMIN') {
        throw new ApiException('INVALID_REQUESTED_ROLE', '申请角色只能是普通成员或管理员')
      }
      return createService(deps).submitJoinRequest(
        context.userId,
        context.openid,
        displayName,
        requestedRole,
      )
    },

    listPendingJoinRequests: async (_payload, context) =>
      createService(deps).listPendingJoinRequests(context.userId),

    reviewJoinRequest: async (payload, context) =>
      createService(deps).reviewJoinRequest(
        context.userId,
        parseReviewInput(payload),
      ),

    listMembers: async (_payload, context) =>
      createService(deps).listMembers(context.userId),

    disableMember: async (payload, context) => {
      const userId = (payload as UserIdPayload | undefined)?.userId
      if (typeof userId !== 'string') {
        throw new ApiException('INVALID_USER_ID', '成员 ID 无效')
      }
      return createService(deps).disableMember(context.userId, userId)
    },

    setAdminRole: async (payload, context) => {
      const input = payload as RolePayload | undefined
      if (
        typeof input?.userId !== 'string' ||
        (input.role !== 'ADMIN' && input.role !== 'MEMBER')
      ) {
        throw new ApiException('INVALID_ROLE', '角色调整请求无效')
      }
      return createService(deps).setAdminRole(context.userId, {
        userId: input.userId,
        role: input.role,
      })
    },

    appointManager: async (payload, context) => {
      const userId = (payload as UserIdPayload | undefined)?.userId
      if (typeof userId !== 'string') {
        throw new ApiException('INVALID_USER_ID', '成员 ID 无效')
      }
      return createService(deps).appointManager(context.userId, userId)
    },

    removeManager: async (payload, context) => {
      const userId = (payload as UserIdPayload | undefined)?.userId
      if (typeof userId !== 'string') {
        throw new ApiException('INVALID_USER_ID', '成员 ID 无效')
      }
      return createService(deps).removeManager(context.userId, userId)
    },

    transferManager: async (payload, context) => {
      const input = payload as TransferManagerPayload | undefined
      if (
        typeof input?.userId !== 'string' ||
        (input.sourceManagerId !== undefined &&
          typeof input.sourceManagerId !== 'string')
      ) {
        throw new ApiException('INVALID_USER_ID', '实际管理者交接请求无效')
      }
      return createService(deps).transferManager(context.userId, {
        targetUserId: input.userId,
        ...(typeof input.sourceManagerId === 'string'
          ? { sourceManagerId: input.sourceManagerId }
          : {}),
      })
    },
  }
}
