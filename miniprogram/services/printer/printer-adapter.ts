import type {
  BitmapPrintJob,
  PrinterDevice,
  PrinterStatus,
} from './types'

export interface PrinterAdapter {
  discover(): Promise<PrinterDevice[]>
  connect(deviceId: string): Promise<void>
  disconnect(): Promise<void>
  getStatus(): PrinterStatus
  print(job: BitmapPrintJob): Promise<void>
}
