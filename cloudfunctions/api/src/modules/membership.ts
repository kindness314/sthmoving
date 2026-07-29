import { ApiException } from '../errors'
import { CloudMembershipRepository } from '../membership/cloud-repository'
import {
  MembershipService,
  type ReviewInput,
} from '../membership/service'
import type { ApiHandler } from '../types'

interface SubmitPayload {
  displayName?: unknown
}

interface ReviewPayload {
  requestId?: unknown
  decision?: unknown
  comment?: unknown
}

function createService(): MembershipService {
  return new MembershipService(new CloudMembershipRepository())
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

export const membershipHandlers: Readonly<Record<string, ApiHandler>> = {
  submitJoinRequest: async (payload, context) => {
    const displayName = (payload as SubmitPayload | undefined)?.displayName
    if (typeof displayName !== 'string') {
      throw new ApiException(
        'INVALID_DISPLAY_NAME',
        '申请人名称必须是字符串',
      )
    }
    return createService().submitJoinRequest(context.openid, displayName)
  },

  listPendingJoinRequests: async (_payload, context) =>
    createService().listPendingJoinRequests(context.openid),

  reviewJoinRequest: async (payload, context) =>
    createService().reviewJoinRequest(context.openid, parseReviewInput(payload)),
}
