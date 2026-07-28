import { callApi } from './cloud-api'

export interface MiniProgramCodeRequest {
  itemId: string
  page: 'pages/item-detail/index'
}

export interface MiniProgramCodeResult {
  fileId: string
  labelCode: string
}

export function generateItemMiniProgramCode(
  itemId: string,
): Promise<MiniProgramCodeResult> {
  return callApi<MiniProgramCodeRequest, MiniProgramCodeResult>({
    module: 'labels',
    action: 'generateMiniProgramCode',
    payload: {
      itemId,
      page: 'pages/item-detail/index',
    },
  })
}
