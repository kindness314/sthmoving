export type ItemLabelStatus = 'PENDING' | 'READY' | 'FAILED'

export interface ItemLabelRecord {
  _id: string
  item_id: string
  public_code: string
  page: 'pages/item-detail/index'
  scene: string
  file_id?: string
  status: ItemLabelStatus
  attempt_count: number
  generation_token?: string
  error_code?: string
  error_message?: string
  generated_at?: string
  created_at: string
  updated_at: string
}

export interface PublicItemLabel {
  itemId: string
  publicCode: string
  page: 'pages/item-detail/index'
  scene: string
  status: ItemLabelStatus
  attemptCount: number
  fileId?: string
  errorMessage?: string
  generatedAt?: string
  updatedAt: string
}

export interface ResolvedItemLabel {
  itemId: string
}
