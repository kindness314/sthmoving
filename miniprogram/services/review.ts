import { callApi } from './cloud-api'

export interface TestAccessInfo {
  enabled: boolean
  expiresAt: string | null
  createdAt: string | null
  createdByName: string | null
  useCount: number
  lastUsedAt: string | null
}

export interface EnabledTestAccess {
  enabled: true
  password: string
  expiresAt: string
}

export function fetchTestAccessInfo(): Promise<TestAccessInfo> {
  return callApi<Record<string, never>, TestAccessInfo>({
    module: 'review',
    action: 'testAccess',
    payload: {},
  })
}

export function enableTestAccess(): Promise<EnabledTestAccess> {
  return callApi<Record<string, never>, EnabledTestAccess>({
    module: 'review',
    action: 'enableTestAccess',
    payload: {},
  })
}

export function disableTestAccess(): Promise<{ enabled: false }> {
  return callApi<Record<string, never>, { enabled: false }>({
    module: 'review',
    action: 'disableTestAccess',
    payload: {},
  })
}
