import type {
  AuthSession,
  PendingJoinRequest,
} from '../types/domain'
import { callApi } from './cloud-api'

export function login(): Promise<AuthSession> {
  return callApi<Record<string, never>, AuthSession>({
    module: 'auth',
    action: 'login',
    payload: {},
  })
}

export function submitJoinRequest(
  displayName: string,
): Promise<AuthSession> {
  return callApi<{ displayName: string }, AuthSession>({
    module: 'membership',
    action: 'submitJoinRequest',
    payload: { displayName },
  })
}

export function listPendingJoinRequests(): Promise<PendingJoinRequest[]> {
  return callApi<Record<string, never>, PendingJoinRequest[]>({
    module: 'membership',
    action: 'listPendingJoinRequests',
    payload: {},
  })
}

export function reviewJoinRequest(
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
): Promise<PendingJoinRequest> {
  return callApi<
    {
      requestId: string
      decision: 'APPROVE' | 'REJECT'
      comment?: string
    },
    PendingJoinRequest
  >({
    module: 'membership',
    action: 'reviewJoinRequest',
    payload: {
      requestId,
      decision,
      ...(comment ? { comment } : {}),
    },
  })
}
