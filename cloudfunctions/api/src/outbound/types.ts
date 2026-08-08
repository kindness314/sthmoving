export type OutboundRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface OutboundRequestRecord {
  _id: string
  item_id: string
  applicant_id: string
  reason: string
  status: OutboundRequestStatus
  reviewer_id?: string
  review_summary?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
}

export interface CreateOutboundRequestInput {
  itemId: string
  reason: string
}

export interface PublicOutboundRequest {
  id: string
  itemId: string
  applicantId: string
  reason: string
  status: OutboundRequestStatus
  createdAt: string
  updatedAt: string
  reviewerId?: string
  reviewComment?: string
  reviewedAt?: string
}

export interface PublicOutboundRequestDetail extends PublicOutboundRequest {
  applicant: {
    id: string
    displayName: string
  }
  item: {
    id: string
    code: string
    name: string
    status: 'ACTIVE' | 'OUTBOUND_PENDING' | 'OFF_SHELF'
    version: number
  }
}

export interface PublicPendingOutboundByItem {
  id: string
  itemId: string
  reason: string
  applicant: {
    id: string
    displayName: string
  }
  createdAt: string
}

export interface PublicMyOutboundRequest extends PublicOutboundRequest {
  item: {
    id: string
    code: string
    name: string
    status: 'ACTIVE' | 'OUTBOUND_PENDING' | 'OFF_SHELF'
    version: number
  } | null
}

export interface ReviewOutboundRequestInput {
  requestId: string
  reviewSummary?: string
}

export interface DirectOutboundInput {
  itemId: string
  expectedVersion: number
  commitSummary: string
}

export interface BatchDirectOutboundItem {
  itemId: string
  expectedVersion: number
}

export interface BatchDirectOutboundInput {
  items: BatchDirectOutboundItem[]
  commitSummary: string
}

export interface PublicBatchDirectOutboundResult {
  itemIds: string[]
  versionAfter: Record<string, number>
  offShelfAt: string
}

export interface BatchDeleteItemsInput {
  itemIds: string[]
}

export interface PublicBatchDeleteResult {
  itemIds: string[]
  deletedImageCount: number
}

export interface PublicDirectOutboundResult {
  itemId: string
  status: 'OFF_SHELF'
  version: number
  offShelfAt: string
}

export interface RestoreInboundInput {
  itemId: string
  expectedVersion: number
  commitSummary: string
}

export interface BatchRestoreInboundItem {
  itemId: string
  expectedVersion: number
}

export interface BatchRestoreInboundInput {
  items: BatchRestoreInboundItem[]
  commitSummary: string
}

export interface PublicRestoreInboundResult {
  itemId: string
  status: 'ACTIVE'
  version: number
  restoredAt: string
}

export interface PublicBatchRestoreInboundResult {
  itemIds: string[]
  versionAfter: Record<string, number>
  restoredAt: string
}
