export type CategoryStatus = 'ACTIVE' | 'DISABLED'

export interface CategoryRecord {
  _id: string
  name: string
  normalized_name: string
  status: CategoryStatus
  is_preset: boolean
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface PublicCategory {
  id: string
  name: string
  status: CategoryStatus
  isPreset: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}
