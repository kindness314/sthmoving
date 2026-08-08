export interface TextEntryModalOptions {
  title: string
  value?: string
  placeholder?: string
  confirmText?: string
  confirmColor?: string
  maxLength?: number
  allowEmpty?: boolean
}

export interface TextEntryModalInstance {
  open(options: TextEntryModalOptions): Promise<string | null>
}
