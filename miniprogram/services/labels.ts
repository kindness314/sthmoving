import { callApi } from './cloud-api'
import type { ItemLabel } from '../types/domain'

export function getItemLabel(itemId: string): Promise<ItemLabel | null> {
  return callApi<{ itemId: string }, ItemLabel | null>({
    module: 'labels',
    action: 'get',
    payload: { itemId },
  })
}

export function generateItemMiniProgramCode(
  itemId: string,
): Promise<ItemLabel> {
  return callApi<{ itemId: string }, ItemLabel>({
    module: 'labels',
    action: 'generateMiniProgramCode',
    payload: { itemId },
  })
}

export function resolveItemLabel(
  scene: string,
): Promise<{ itemId: string }> {
  return callApi<{ scene: string }, { itemId: string }>({
    module: 'labels',
    action: 'resolve',
    payload: { scene },
  })
}
