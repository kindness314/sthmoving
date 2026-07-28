import type { User } from '../types/domain'
import { callApi } from './cloud-api'

export function login(): Promise<User> {
  return callApi<Record<string, never>, User>({
    module: 'auth',
    action: 'login',
    payload: {},
  })
}
