import type { ItemRecord } from '../items/types'
import type { UserRecord } from '../membership/types'
import type { ItemLabelRecord } from './types'

export interface LabelUnitOfWork {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  getItem(itemId: string): Promise<ItemRecord | null>
  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null>
  getLabelByPublicCode(
    publicCode: string,
  ): Promise<ItemLabelRecord | null>
  setLabel(label: ItemLabelRecord): Promise<void>
}

export interface LabelRepository {
  runTransaction<T>(
    operation: (unitOfWork: LabelUnitOfWork) => Promise<T>,
  ): Promise<T>
}
