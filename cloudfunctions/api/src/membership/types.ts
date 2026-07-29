export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED'

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type AccessState =
  | 'UNAPPLIED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISABLED'

export interface UserRecord {
  _id: string
  openid: string
  display_name: string
  avatar_url?: string
  role: UserRole
  status: UserStatus
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
}

export interface JoinRequestRecord {
  _id: string
  applicant_id: string
  display_name: string
  status: JoinRequestStatus
  review_comment?: string
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
}

export interface PublicUser {
  id: string
  displayName: string
  avatarUrl?: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
}

export interface AuthSession {
  user: PublicUser
  accessState: AccessState
}

export interface PendingJoinRequest {
  id: string
  applicant: PublicUser
  displayName: string
  createdAt: string
}
