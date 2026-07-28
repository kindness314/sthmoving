export interface PrinterDevice {
  id: string
  name: string
  model?: string
}

export type PrinterStatus = 'DISCONNECTED' | 'CONNECTING' | 'READY' | 'PRINTING'

export interface MonochromeBitmap {
  widthDots: number
  heightDots: number
  bytesPerRow: number
  data: Uint8Array
}

export interface BitmapPrintJob {
  id: string
  copies: number
  bitmap: MonochromeBitmap
}
