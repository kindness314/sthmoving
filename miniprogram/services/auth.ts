import type {
  AuthSession,
  PendingJoinRequest,
  PublicMember,
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
  requestedRole: 'ADMIN' | 'MEMBER' = 'MEMBER',
): Promise<AuthSession> {
  return callApi<{ displayName: string; requestedRole: 'ADMIN' | 'MEMBER' }, AuthSession>({
    module: 'membership',
    action: 'submitJoinRequest',
    payload: { displayName, requestedRole },
  })
}

export function listMembers(): Promise<PublicMember[]> {
  return callApi<Record<string, never>, PublicMember[]>({
    module: 'membership',
    action: 'listMembers',
    payload: {},
  })
}

export function disableMember(userId: string): Promise<PublicMember> {
  return callApi<{ userId: string }, PublicMember>({
    module: 'membership',
    action: 'disableMember',
    payload: { userId },
  })
}

export function setAdminRole(
  userId: string,
  role: 'ADMIN' | 'MEMBER',
): Promise<PublicMember> {
  return callApi<{ userId: string; role: 'ADMIN' | 'MEMBER' }, PublicMember>({
    module: 'membership',
    action: 'setAdminRole',
    payload: { userId, role },
  })
}

export function appointManager(userId: string): Promise<PublicMember> {
  return callApi<{ userId: string }, PublicMember>({
    module: 'membership',
    action: 'appointManager',
    payload: { userId },
  })
}

export function removeManager(userId: string): Promise<PublicMember> {
  return callApi<{ userId: string }, PublicMember>({
    module: 'membership',
    action: 'removeManager',
    payload: { userId },
  })
}

export function transferManager(
  userId: string,
  sourceManagerId?: string,
): Promise<PublicMember> {
  return callApi<{ userId: string; sourceManagerId?: string }, PublicMember>({
    module: 'membership',
    action: 'transferManager',
    payload: {
      userId,
      ...(sourceManagerId ? { sourceManagerId } : {}),
    },
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
