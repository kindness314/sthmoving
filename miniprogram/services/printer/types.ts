export interface PrinterDevice {
  id: string
  name: string
  model?: string
  rssi?: number
}

export type PrinterStatus =
  | 'DISCONNECTED'
  | 'DISCOVERING'
  | 'CONNECTING'
  | 'READY'
  | 'PRINTING'

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

export interface RemoteImagePrintJob {
  id: string
  copies: number
  imageUrl: string
  widthMillimetres: number
  heightMillimetres: number
  imageWidthMillimetres: number
  imageHeightMillimetres: number
  density: number
  horizontalOffsetMillimetres: number
  verticalOffsetMillimetres: number
  paperType: 1 | 2 | 3 | 5
  gapMillimetres: number
  speedMillimetresPerSecond: number
}

export interface PrinterRenderLayout {
  width: number
  height: number
  barcodeWidth: number
  barcodeHeight: number
  qrcodeWidth: number
  qrcodeHeight: number
}

export interface PrinterRenderContext {
  canvasText: WechatMiniprogram.CanvasContext
  canvasBarCode: WechatMiniprogram.SelectorQuery
  onLayout(layout: PrinterRenderLayout): void
}
