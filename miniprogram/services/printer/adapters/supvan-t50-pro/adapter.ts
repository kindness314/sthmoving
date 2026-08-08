import { PrinterError, type PrinterErrorCode } from '../../errors'
import type { PrinterAdapter } from '../../printer-adapter'
import { assertValidRemoteImagePrintJob } from '../../remote-image-job'
import type {
  PrinterDevice,
  PrinterRenderContext,
  PrinterRenderLayout,
  PrinterStatus,
  RemoteImagePrintJob,
} from '../../types'

interface SupvanDeviceInfo {
  deviceId: string
  name: string
  RSSI?: number
}

interface SupvanResultValue {
  devices?: SupvanDeviceInfo[]
  width?: number
  height?: number
  barcodeWidth?: number
  barcodeHeight?: number
  qrcodeWidth?: number
  qrcodeHeight?: number
  num?: number
  msg?: string
}

interface SupvanResult {
  ResultCode?: number
  ResultValue?: SupvanResultValue
  ErrorMsg?: unknown
  ErrorMessage?: unknown
}

export interface SupvanBleTool {
  scanBleDeviceList(
    callback: (result: SupvanResult) => void,
  ): Promise<void>
  stopScanBleDevices(): Promise<SupvanResult>
  connectBleDevice(device: SupvanDeviceInfo): Promise<SupvanResult>
  disconnectBleDevice(): Promise<SupvanResult>
  stopPrint(callback: (result: SupvanResult) => void): Promise<void>
}

export interface SupvanPrintManager {
  doPrintImage(
    canvasText: WechatMiniprogram.CanvasContext,
    pages: SupvanImagePage[],
    callback: (result: SupvanResult) => void,
  ): Promise<SupvanResult | void>
}

export interface SupvanSdk {
  bleTool: SupvanBleTool
  printManager: SupvanPrintManager
}

interface SupvanImagePage {
  Width: number
  Height: number
  Rotate: 1 | 2
  Copies: number
  Density: number
  HorizontalNum: number
  VerticalNum: number
  PaperType: 1 | 2 | 3 | 5
  Gap: number
  DeviceSn: string
  ImageUrl: string
  ImageWidth: number
  ImageHeight: number
  Speed: number
}

interface DiscoveredDevice {
  publicDevice: PrinterDevice
  sdkDevice: SupvanDeviceInfo
}

const sdkErrorCodes: Partial<Record<number, PrinterErrorCode>> = {
  101: 'BLUETOOTH_INITIALIZATION_FAILED',
  102: 'BLUETOOTH_UNAVAILABLE',
  103: 'DISCOVERY_FAILED',
  104: 'DISCOVERY_FAILED',
  105: 'BLUETOOTH_UNAVAILABLE',
  106: 'DISCONNECT_FAILED',
  107: 'NOT_CONNECTED',
  109: 'CONNECTION_FAILED',
  110: 'CONNECTION_FAILED',
  111: 'CONNECTION_FAILED',
  112: 'CONNECTION_FAILED',
  113: 'CONNECTION_FAILED',
  114: 'CONNECTION_FAILED',
  115: 'CONNECTION_FAILED',
  119: 'IMAGE_RENDER_FAILED',
  120: 'IMAGE_RENDER_FAILED',
  121: 'IMAGE_DOWNLOAD_FAILED',
  122: 'IMAGE_RENDER_FAILED',
  123: 'IMAGE_DOWNLOAD_FAILED',
  124: 'IMAGE_RENDER_FAILED',
  125: 'PRINT_ABORTED',
  126: 'COVER_OPEN',
  127: 'MEDIA_NOT_INSTALLED',
  128: 'MEDIA_LOW',
  129: 'MEDIA_NOT_INSTALLED',
  130: 'MEDIA_UNRECOGNIZED',
  131: 'MEDIA_EMPTY',
  132: 'PRINT_ABORTED',
  133: 'RIBBON_ERROR',
  134: 'COMPRESSION_FAILED',
  135: 'PRINT_DATA_EMPTY',
}

export class SupvanT50ProAdapter
  implements PrinterAdapter<RemoteImagePrintJob>
{
  private readonly devices = new Map<string, DiscoveredDevice>()
  private status: PrinterStatus = 'DISCONNECTED'
  private connectedDevice: DiscoveredDevice | null = null
  private renderContext: PrinterRenderContext | null = null
  private discovering = false
  private discoverySession = 0

  constructor(private readonly sdk: SupvanSdk) {}

  bindRenderContext(context: PrinterRenderContext): void {
    this.renderContext = context
  }

  async discover(
    onDevices: (devices: PrinterDevice[]) => void,
  ): Promise<void> {
    if (this.status === 'CONNECTING' || this.status === 'PRINTING') {
      throw new PrinterError('PRINTER_BUSY')
    }
    if (this.discovering) {
      await this.stopDiscovery()
    }

    this.devices.clear()
    this.discovering = true
    const discoverySession = ++this.discoverySession
    this.status = 'DISCOVERING'
    try {
      await this.sdk.bleTool.scanBleDeviceList((result) => {
        if (
          !this.discovering ||
          discoverySession !== this.discoverySession
        ) {
          return
        }
        if (result.ResultCode !== 0) {
          return
        }
        for (const device of result.ResultValue?.devices ?? []) {
          if (!device.deviceId || !device.name) {
            continue
          }
          const publicDevice: PrinterDevice = {
            id: device.deviceId,
            name: device.name,
            ...(typeof device.RSSI === 'number' ? { rssi: device.RSSI } : {}),
          }
          this.devices.set(device.deviceId, {
            publicDevice,
            sdkDevice: device,
          })
        }
        onDevices(this.listDevices())
      })
    } catch (error) {
      this.discovering = false
      this.status = this.connectedDevice ? 'READY' : 'DISCONNECTED'
      throw mapSupvanError(error, 'DISCOVERY_FAILED')
    }
  }

  async stopDiscovery(): Promise<void> {
    if (!this.discovering) {
      return
    }
    this.discovering = false
    this.discoverySession += 1
    try {
      await this.sdk.bleTool.stopScanBleDevices()
    } catch (error) {
      throw mapSupvanError(error, 'DISCOVERY_FAILED')
    } finally {
      this.status = this.connectedDevice ? 'READY' : 'DISCONNECTED'
    }
  }

  async connect(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new PrinterError('CONNECTION_FAILED')
    }
    if (this.status === 'PRINTING') {
      throw new PrinterError('PRINTER_BUSY')
    }

    if (this.discovering) {
      await this.stopDiscovery()
    }
    this.status = 'CONNECTING'
    try {
      const result = await this.sdk.bleTool.connectBleDevice(device.sdkDevice)
      assertSuccessfulSdkResult(result, 'CONNECTION_FAILED')
      this.connectedDevice = device
      this.status = 'READY'
    } catch (error) {
      this.connectedDevice = null
      this.status = 'DISCONNECTED'
      throw mapSupvanError(error, 'CONNECTION_FAILED')
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedDevice) {
      this.status = 'DISCONNECTED'
      return
    }
    if (this.status === 'PRINTING') {
      throw new PrinterError('PRINTER_BUSY')
    }
    try {
      const result = await this.sdk.bleTool.disconnectBleDevice()
      assertSuccessfulSdkResult(result, 'DISCONNECT_FAILED')
    } catch (error) {
      throw mapSupvanError(error, 'DISCONNECT_FAILED')
    } finally {
      this.connectedDevice = null
      this.status = 'DISCONNECTED'
    }
  }

  getStatus(): PrinterStatus {
    return this.status
  }

  getConnectedDevice(): PrinterDevice | null {
    return this.connectedDevice?.publicDevice ?? null
  }

  async print(job: RemoteImagePrintJob): Promise<void> {
    assertValidRemoteImagePrintJob(job)
    if (!this.connectedDevice) {
      throw new PrinterError('NOT_CONNECTED')
    }
    if (this.status !== 'READY') {
      throw new PrinterError('PRINTER_BUSY')
    }
    if (!this.renderContext) {
      throw new PrinterError('RENDER_CONTEXT_MISSING')
    }

    const renderContext = this.renderContext
    const page: SupvanImagePage = {
      Width: job.widthMillimetres,
      Height: job.heightMillimetres,
      Rotate: 1,
      Copies: job.copies,
      Density: job.density,
      HorizontalNum: job.horizontalOffsetMillimetres,
      VerticalNum: job.verticalOffsetMillimetres,
      PaperType: job.paperType,
      Gap: job.gapMillimetres,
      DeviceSn: this.connectedDevice.publicDevice.name,
      ImageUrl: job.imageUrl,
      ImageWidth: job.imageWidthMillimetres,
      ImageHeight: job.imageHeightMillimetres,
      Speed: job.speedMillimetresPerSecond,
    }

    this.status = 'PRINTING'
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const settle = (error?: PrinterError) => {
          if (settled) {
            return
          }
          settled = true
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }
        const handleResult = (result: SupvanResult) => {
          const code = result.ResultCode
          if (code === 100) {
            renderContext.onLayout(toRenderLayout(result.ResultValue))
            return
          }
          if (code === 0 || code === 1) {
            settle()
            return
          }
          if (typeof code === 'number') {
            settle(mapSupvanError(result, 'SDK_ERROR'))
          }
        }

        void this.sdk.printManager
          .doPrintImage(renderContext.canvasText, [page], handleResult)
          .then((result) => {
            if (result && result.ResultCode !== undefined) {
              handleResult(result)
            }
          })
          .catch((error: unknown) => {
            settle(mapSupvanError(error, 'SDK_ERROR'))
          })
      })
    } finally {
      this.status = this.connectedDevice ? 'READY' : 'DISCONNECTED'
    }
  }

  async stopPrint(): Promise<void> {
    if (this.status !== 'PRINTING') {
      return
    }
    try {
      await this.sdk.bleTool.stopPrint(() => undefined)
    } catch (error) {
      throw mapSupvanError(error, 'PRINT_ABORTED')
    } finally {
      this.status = this.connectedDevice ? 'READY' : 'DISCONNECTED'
    }
  }

  private listDevices(): PrinterDevice[] {
    return [...this.devices.values()]
      .map(({ publicDevice }) => publicDevice)
      .sort((left, right) => (right.rssi ?? -Infinity) - (left.rssi ?? -Infinity))
  }
}

export function mapSupvanError(
  error: unknown,
  fallbackCode: PrinterErrorCode,
): PrinterError {
  if (error instanceof PrinterError) {
    return error
  }
  const resultCode = readResultCode(error)
  const code = resultCode === undefined
    ? fallbackCode
    : sdkErrorCodes[resultCode] ?? fallbackCode
  return new PrinterError(code, {
    ...(resultCode === undefined ? {} : { sdkResultCode: resultCode }),
    cause: error,
  })
}

function assertSuccessfulSdkResult(
  result: SupvanResult,
  fallbackCode: PrinterErrorCode,
): void {
  if (result.ResultCode !== 0 && result.ResultCode !== 1) {
    throw mapSupvanError(result, fallbackCode)
  }
}

function readResultCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const value = (error as { ResultCode?: unknown }).ResultCode
  return typeof value === 'number' ? value : undefined
}

function toRenderLayout(
  value: SupvanResultValue | undefined,
): PrinterRenderLayout {
  return {
    width: positiveNumber(value?.width, 240),
    height: positiveNumber(value?.height, 240),
    barcodeWidth: positiveNumber(value?.barcodeWidth, 20),
    barcodeHeight: positiveNumber(value?.barcodeHeight, 20),
    qrcodeWidth: positiveNumber(value?.qrcodeWidth, 20),
    qrcodeHeight: positiveNumber(value?.qrcodeHeight, 20),
  }
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}
