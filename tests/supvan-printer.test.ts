import { describe, expect, it } from 'vitest'

import {
  mapSupvanError,
  SupvanT50ProAdapter,
  type SupvanSdk,
} from '../miniprogram/services/printer/adapters/supvan-t50-pro/adapter'
import type { RemoteImagePrintJob } from '../miniprogram/services/printer/types'

const printJob: RemoteImagePrintJob = {
  id: 'label-item-1',
  copies: 2,
  imageUrl: 'https://example.com/item-code.png',
  widthMillimetres: 30,
  heightMillimetres: 30,
  imageWidthMillimetres: 30,
  imageHeightMillimetres: 30,
  density: 4,
  horizontalOffsetMillimetres: 0,
  verticalOffsetMillimetres: 0,
  paperType: 1,
  gapMillimetres: 3,
  speedMillimetresPerSecond: 30,
}

describe('硕方 T50 Pro 适配器', () => {
  it('搜索并连接 SDK 返回的设备', async () => {
    const sdk = createSdk()
    const adapter = new SupvanT50ProAdapter(sdk)
    let devices: Array<{ id: string; name: string }> = []

    await adapter.discover((value) => {
      devices = value
    })

    expect(devices).toEqual([
      { id: 'printer-1', name: 'T50PRO-001', rssi: -40 },
    ])
    expect(adapter.getStatus()).toBe('DISCOVERING')

    await adapter.connect('printer-1')

    expect(adapter.getStatus()).toBe('READY')
    expect(adapter.getConnectedDevice()?.name).toBe('T50PRO-001')
  })

  it('按 30×30 mm 参数打印 HTTPS 小程序码原图', async () => {
    let capturedPage: Record<string, unknown> | undefined
    const layouts: Array<{ width: number; height: number }> = []
    const sdk = createSdk({
      onPrint(pages, callback) {
        capturedPage = pages[0]
        callback({
          ResultCode: 100,
          ResultValue: {
            width: 240,
            height: 240,
            barcodeWidth: 20,
            barcodeHeight: 20,
            qrcodeWidth: 20,
            qrcodeHeight: 20,
          },
        })
        callback({ ResultCode: 0, ResultValue: { num: 2 } })
      },
    })
    const adapter = new SupvanT50ProAdapter(sdk)
    adapter.bindRenderContext({
      canvasText: {} as WechatMiniprogram.CanvasContext,
      canvasBarCode: {} as WechatMiniprogram.SelectorQuery,
      onLayout(layout) {
        layouts.push({ width: layout.width, height: layout.height })
      },
    })
    await adapter.discover(() => undefined)
    await adapter.connect('printer-1')

    await adapter.print(printJob)

    expect(capturedPage).toMatchObject({
      Width: 30,
      Height: 30,
      Copies: 2,
      Density: 4,
      PaperType: 1,
      Gap: 3,
      DeviceSn: 'T50PRO-001',
      ImageUrl: 'https://example.com/item-code.png',
      ImageWidth: 30,
      ImageHeight: 30,
      Speed: 30,
    })
    expect(layouts).toEqual([{ width: 240, height: 240 }])
    expect(adapter.getStatus()).toBe('READY')
  })

  it('把耗材与仓盖结果码转换为稳定错误', () => {
    expect(mapSupvanError({ ResultCode: 126 }, 'SDK_ERROR')).toMatchObject({
      code: 'COVER_OPEN',
      message: '请关闭打印机耗材仓盖',
    })
    expect(mapSupvanError({ ResultCode: 131 }, 'SDK_ERROR')).toMatchObject({
      code: 'MEDIA_EMPTY',
      message: '标签纸已用完，请更换耗材',
    })
  })
})

function createSdk(options: {
  onPrint?: (
    pages: Array<Record<string, unknown>>,
    callback: (result: {
      ResultCode: number
      ResultValue?: Record<string, unknown>
    }) => void,
  ) => void
} = {}): SupvanSdk {
  return {
    bleTool: {
      async scanBleDeviceList(callback) {
        callback({
          ResultCode: 0,
          ResultValue: {
            devices: [
              { deviceId: 'printer-1', name: 'T50PRO-001', RSSI: -40 },
            ],
          },
        })
      },
      async stopScanBleDevices() {
        return { ResultCode: 0 }
      },
      async connectBleDevice() {
        return { ResultCode: 0 }
      },
      async disconnectBleDevice() {
        return { ResultCode: 0 }
      },
      async stopPrint(callback) {
        callback({ ResultCode: 0 })
      },
    },
    printManager: {
      async doPrintImage(_canvasText, pages, callback) {
        if (options.onPrint) {
          options.onPrint(
            pages as unknown as Array<Record<string, unknown>>,
            callback as (result: {
              ResultCode: number
              ResultValue?: Record<string, unknown>
            }) => void,
          )
        } else {
          callback({ ResultCode: 0 })
        }
      },
    },
  }
}
