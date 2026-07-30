import type { Category } from '../types/domain'
import { callApi } from './cloud-api'

export function listCategories(): Promise<Category[]> {
  return callApi<Record<string, never>, Category[]>({
    module: 'categories',
    action: 'list',
    payload: {},
  })
}

export function listManageableCategories(): Promise<Category[]> {
  return callApi<Record<string, never>, Category[]>({
    module: 'categories',
    action: 'listManageable',
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

export function renameCategory(
  categoryId: string,
  name: string,
): Promise<Category> {
  return callApi<{ categoryId: string; name: string }, Category>({
    module: 'categories',
    action: 'rename',
    payload: { categoryId, name },
  })
}

export function setCategoryStatus(
  categoryId: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<Category> {
  return callApi<
    { categoryId: string; status: 'ACTIVE' | 'DISABLED' },
    Category
  >({
    module: 'categories',
    action: 'setStatus',
    payload: { categoryId, status },
  })
}
