import type { OutboundRequest } from '../types/domain'
import { callApi } from './cloud-api'

export interface CreateOutboundRequestInput {
  itemId: string
  reason: string
}

export function createOutboundRequest(
  input: CreateOutboundRequestInput,
): Promise<OutboundRequest> {
  return callApi<CreateOutboundRequestInput, OutboundRequest>({
    module: 'outbound',
    action: 'create',
    payload: input,
  })
}

export function listPendingOutboundRequests(): Promise<OutboundRequest[]> {
  return callApi<Record<string, never>, OutboundRequest[]>({
    module: 'outbound',
    action: 'listPending',
    payload: {},
  })
}

export function listMyOutboundRequests(): Promise<OutboundRequest[]> {
  return callApi<Record<string, never>, OutboundRequest[]>({
    module: 'outbound',
    action: 'listMine',
    payload: {},
  })
}

export interface PendingOutboundByItem {
  id: string
  itemId: string
  reason: string
  applicant: {
    id: string
    displayName: string
  }
  createdAt: string
}

export function getPendingOutboundByItem(
  itemId: string,
): Promise<PendingOutboundByItem | null> {
  return callApi<{ itemId: string }, PendingOutboundByItem | null>({
    module: 'outbound',
    action: 'pendingByItem',
    payload: { itemId },
  })
}

export function approveOutboundRequest(
  requestId: string,
): Promise<OutboundRequest> {
  return callApi<{ requestId: string }, OutboundRequest>({
    module: 'outbound',
    action: 'approve',
    payload: { requestId },
  })
}

export function rejectOutboundRequest(
  requestId: string,
  reviewSummary: string,
): Promise<OutboundRequest> {
  return callApi<{ requestId: string; reviewSummary: string }, OutboundRequest>({
    module: 'outbound',
    action: 'reject',
    payload: { requestId, reviewSummary },
  })
}

export interface DirectOutboundInput {
  itemId: string
  expectedVersion: number
  commitSummary: string
}

export interface DirectOutboundResult {
  itemId: string
  status: 'OFF_SHELF'
  version: number
  offShelfAt: string
}

export function directOutbound(
  input: DirectOutboundInput,
): Promise<DirectOutboundResult> {
  return callApi<DirectOutboundInput, DirectOutboundResult>({
    module: 'outbound',
    action: 'direct',
    payload: input,
  })
}

export interface BatchDirectOutboundItem {
  itemId: string
  expectedVersion: number
}

export interface BatchDirectOutboundInput {
  items: BatchDirectOutboundItem[]
  commitSummary: string
}

export interface BatchDirectOutboundResult {
  itemIds: string[]
  versionAfter: Record<string, number>
  offShelfAt: string
}

export function batchDirectOutbound(
  input: BatchDirectOutboundInput,
): Promise<BatchDirectOutboundResult> {
  return callApi<BatchDirectOutboundInput, BatchDirectOutboundResult>({
    module: 'outbound',
    action: 'batchDirect',
    payload: input,
  })
}

export interface BatchDeleteOutboundInput {
  itemIds: string[]
}

export interface BatchDeleteOutboundResult {
  itemIds: string[]
  deletedImageCount: number
}

export function batchDeleteOutboundItems(
  input: BatchDeleteOutboundInput,
): Promise<BatchDeleteOutboundResult> {
  return callApi<BatchDeleteOutboundInput, BatchDeleteOutboundResult>({
    module: 'outbound',
    action: 'batchDelete',
    payload: input,
  })
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

export interface RestoreInboundResult {
  itemId: string
  status: 'ACTIVE'
  version: number
  restoredAt: string
}

export function restoreInbound(
  input: RestoreInboundInput,
): Promise<RestoreInboundResult> {
  return callApi<RestoreInboundInput, RestoreInboundResult>({
    module: 'outbound',
    action: 'restore',
    payload: input,
  })
}

export interface BatchRestoreInboundResult {
  itemIds: string[]
  versionAfter: Record<string, number>
  restoredAt: string
}

export function batchRestoreInbound(
  input: BatchRestoreInboundInput,
): Promise<BatchRestoreInboundResult> {
  return callApi<BatchRestoreInboundInput, BatchRestoreInboundResult>({
    module: 'outbound',
    action: 'batchRestore',
    payload: input,
  })
}
