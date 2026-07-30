import type { Category } from '../types/domain'
import { callApi } from './cloud-api'

export function listCategories(): Promise<Category[]> {
  return callApi<Record<string, never>, Category[]>({
    module: 'categories',
    action: 'list',
    payload: {},
  })
}

export function createCategory(name: string): Promise<Category> {
  return callApi<{ name: string }, Category>({
    module: 'categories',
    action: 'create',
    payload: { name },
  })
}
