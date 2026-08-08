export type NotificationKind = 'JOIN_REQUEST' | 'OUTBOUND_REQUEST'

export type NotificationTarget = 'MEMBER_REVIEW' | 'OUTBOUND_REVIEW'

export type NotificationStatus = 'UNREAD' | 'READ'

export type NotificationTargetStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'NOT_FOUND'

export interface NotificationRecord {
  _id: string
  recipient_id: string
  kind: NotificationKind
  title: string
  body: string
  target: NotificationTarget
  target_id: string
  status: NotificationStatus
  created_at: string
  updated_at: string
  read_at?: string
}

export interface PublicNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  target: NotificationTarget
  targetId: string
  status: NotificationStatus
  targetStatus: NotificationTargetStatus
  createdAt: string
  updatedAt: string
  readAt?: string
}

export interface PublicNotificationList {
  items: PublicNotification[]
  unreadCount: number
}
