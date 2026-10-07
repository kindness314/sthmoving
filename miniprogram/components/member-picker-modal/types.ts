import type { MemberCandidate } from '../../services/auth'

export interface MemberPickerModalOptions {
  title: string
  placeholder?: string
}

export interface MemberPickerModalInstance {
  open(options: MemberPickerModalOptions): Promise<MemberCandidate | null>
}
