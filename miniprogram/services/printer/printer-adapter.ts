import type {
  BitmapPrintJob,
  PrinterDevice,
  PrinterRenderContext,
  PrinterStatus,
} from './types'

export interface PrinterAdapter<TPrintJob = BitmapPrintJob> {
  bindRenderContext(context: PrinterRenderContext): void
  discover(onDevices: (devices: PrinterDevice[]) => void): Promise<void>
  stopDiscovery(): Promise<void>
  connect(deviceId: string): Promise<void>
  disconnect(): Promise<void>
  getStatus(): PrinterStatus
  getConnectedDevice(): PrinterDevice | null
  print(job: TPrintJob): Promise<void>
  stopPrint(): Promise<void>
}
