import { getThemeStyle } from '../../services/theme'
import {
  generateItemMiniProgramCode,
  getItemLabel,
} from '../../services/labels'
import { getItemDetail } from '../../services/items'
import { supvanT50ProPrinter } from '../../services/printer/adapters/supvan-t50-pro/runtime'
import type {
  PrinterDevice,
  PrinterStatus,
} from '../../services/printer/types'
import type { ItemDetail, ItemLabel, UserRole } from '../../types/domain'

type LabelSizeMillimetres = 20 | 30

const labelSizeOptions: Array<{
  value: LabelSizeMillimetres
  label: string
}> = [
  { value: 30, label: '30 × 30 mm' },
  { value: 20, label: '20 × 20 mm' },
]

Page({ data: {
  themeStyle: getThemeStyle(),
  itemId: '',
  item: null as ItemDetail | null,
  label: null as ItemLabel | null,
  labelImageUrl: '',
  loading: true,
  generating: false,
  errorMessage: '',
  printerDevices: [] as PrinterDevice[],
  printerStatus: 'DISCONNECTED' as PrinterStatus,
  printerStatusText: '尚未连接打印机',
  connectedDeviceName: '',
  discovering: false,
  connectingDeviceId: '',
  printing: false,
  copiesInput: '1',
  maxCopies: 15,
  centerOnLargerPaper: false,
  labelSizeOptions,
  selectedLabelSize: 30 as LabelSizeMillimetres,
  printerErrorMessage: '',
  templateWidth: 240,
  templateHeight: 240,
  barCodeWidth: 20,
  barCodeHeight: 20,
  qrCodeWidth: 20,
  qrCodeHeight: 20,
  pixelRatio: 1,
},
  onShow() {
    this.setData({ themeStyle: getThemeStyle() })
  }, onLoad(options: Record<string, string | undefined>) {
    this.setData({ themeStyle: getThemeStyle() })
    const role: UserRole | '' =
      getApp<IAppOption>().globalData.currentUser?.role ?? ''
    this.setData({ maxCopies: role === 'MEMBER' || role === '' ? 15 : 99 })
    const itemId = safeDecode(options['itemId'])
    this.setData({ itemId })
    void this.loadPage()
  }, onReady() {
    const canvasText = wx.createCanvasContext('Canvas', this)
    const canvasBarCode = wx.createSelectorQuery().in(this)
    supvanT50ProPrinter.bindRenderContext({
      canvasText,
      canvasBarCode,
      onLayout: (layout) => {
        this.setData({
          templateWidth: layout.width,
          templateHeight: layout.height,
          barCodeWidth: layout.barcodeWidth,
          barCodeHeight: layout.barcodeHeight,
          qrCodeWidth: layout.qrcodeWidth,
          qrCodeHeight: layout.qrcodeHeight,
        })
      },
    })
    this.setData({ pixelRatio: wx.getWindowInfo().pixelRatio })
    this.syncPrinterState()
  },

  onUnload() {
    void supvanT50ProPrinter.stopDiscovery().catch(() => undefined)
    void supvanT50ProPrinter.disconnect().catch(() => undefined)
  },

  onPullDownRefresh() {
    void this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  handleRetry() {
    void this.generateLabel()
  },

  handlePreview() {
    const imageUrl = this.data.labelImageUrl
    if (!imageUrl) {
      return
    }
    void wx.previewImage({
      current: imageUrl,
      urls: [imageUrl],
    })
  },

  async handleStartPrinterDiscovery() {
    if (this.data.discovering || this.data.connectingDeviceId) {
      return
    }
    this.setData({
      printerDevices: [],
      discovering: true,
      printerErrorMessage: '',
    })
    try {
      await supvanT50ProPrinter.discover((printerDevices) => {
        this.setData({ printerDevices })
      })
      this.syncPrinterState()
    } catch (error) {
      this.setData({
        printerErrorMessage: readErrorMessage(error, '搜索打印机失败'),
      })
    } finally {
      if (supvanT50ProPrinter.getStatus() !== 'DISCOVERING') {
        this.setData({ discovering: false })
      }
      this.syncPrinterState()
    }
  },

  async handleStopPrinterDiscovery() {
    try {
      await supvanT50ProPrinter.stopDiscovery()
    } catch (error) {
      this.setData({
        printerErrorMessage: readErrorMessage(error, '停止搜索失败'),
      })
    } finally {
      this.setData({ discovering: false })
      this.syncPrinterState()
    }
  },

  async handleConnectPrinter(event: WechatMiniprogram.BaseEvent) {
    const deviceId = event.currentTarget.dataset['deviceId'] as
      | string
      | undefined
    if (!deviceId || this.data.connectingDeviceId || this.data.printing) {
      return
    }
    this.setData({
      connectingDeviceId: deviceId,
      printerErrorMessage: '',
    })
    try {
      await supvanT50ProPrinter.connect(deviceId)
      this.setData({ discovering: false })
      this.syncPrinterState()
      await wx.showToast({ title: '连接成功', icon: 'success' })
    } catch (error) {
      this.setData({
        printerErrorMessage: readErrorMessage(error, '连接打印机失败'),
      })
    } finally {
      this.setData({ connectingDeviceId: '' })
      this.syncPrinterState()
    }
  },

  async handleDisconnectPrinter() {
    if (this.data.printing) {
      return
    }
    try {
      await supvanT50ProPrinter.disconnect()
    } catch (error) {
      this.setData({
        printerErrorMessage: readErrorMessage(error, '断开打印机失败'),
      })
    } finally {
      this.syncPrinterState()
    }
  },

  handleCopiesInput(event: WechatMiniprogram.Input) {
    this.setData({
      copiesInput: event.detail.value,
      printerErrorMessage: '',
    })
  },

  handleLabelSizeChange(event: WechatMiniprogram.BaseEvent) {
    if (this.data.printing) {
      return
    }
    const size = Number(event.currentTarget.dataset['size'])
    if (size !== 20 && size !== 30) {
      return
    }
    this.setData({
      selectedLabelSize: size as LabelSizeMillimetres,
      printerErrorMessage: '',
    })
  },

  handleCenterToggle(event: WechatMiniprogram.SwitchChange) {
    this.setData({ centerOnLargerPaper: event.detail.value })
  },

  async handlePrintLabel() {
    if (this.data.printing || !this.data.labelImageUrl) {
      return
    }
    const copies = Number(this.data.copiesInput)
    const maxCopies = this.data.maxCopies
    if (!Number.isInteger(copies) || copies < 1 || copies > maxCopies) {
      this.setData({
        printerErrorMessage: `打印份数必须是 1-${maxCopies} 的整数`,
      })
      return
    }
    const labelSize = this.data.selectedLabelSize

    this.setData({ printing: true, printerErrorMessage: '' })
    this.syncPrinterState()
    try {
      await supvanT50ProPrinter.print({
        id: `label-${this.data.itemId}-${Date.now()}`,
        copies,
        imageUrl: this.data.labelImageUrl,
        widthMillimetres:
          labelSize === 20 && this.data.centerOnLargerPaper ? 30 : labelSize,
        heightMillimetres:
          labelSize === 20 && this.data.centerOnLargerPaper ? 30 : labelSize,
        imageWidthMillimetres: labelSize,
        imageHeightMillimetres: labelSize,
        density: 4,
        horizontalOffsetMillimetres:
          labelSize === 20 && this.data.centerOnLargerPaper ? 5 : 0,
        verticalOffsetMillimetres:
          labelSize === 20 && this.data.centerOnLargerPaper ? 5 : 0,
        paperType: 1,
        gapMillimetres: 3,
        speedMillimetresPerSecond: 30,
      })
      await wx.showToast({ title: '打印完成', icon: 'success' })
    } catch (error) {
      this.setData({
        printerErrorMessage: readErrorMessage(error, '打印失败'),
      })
    } finally {
      this.setData({ printing: false })
      this.syncPrinterState()
    }
  },

  async loadPage() {
    if (!this.data.itemId) {
      this.setData({
        loading: false,
        errorMessage: '物品链接无效',
      })
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      const [item, label] = await Promise.all([
        getItemDetail(this.data.itemId),
        getItemLabel(this.data.itemId),
      ])
      this.setData({
        item,
        label,
        labelImageUrl: label?.fileUrl ?? '',
      })
      if (!label || label.status === 'PENDING') {
        await this.generateLabel()
      }
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '加载小程序码失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async generateLabel() {
    if (!this.data.itemId || this.data.generating) {
      return
    }
    this.setData({ generating: true, errorMessage: '' })
    try {
      const label = await generateItemMiniProgramCode(this.data.itemId)
      this.setData({
        label,
        labelImageUrl: label.fileUrl ?? '',
      })
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '生成小程序码失败',
      })
    } finally {
      this.setData({ generating: false })
    }
  },

  syncPrinterState() {
    const printerStatus = supvanT50ProPrinter.getStatus()
    const connectedDeviceName =
      supvanT50ProPrinter.getConnectedDevice()?.name ?? ''
    this.setData({
      printerStatus,
      printerStatusText: describePrinterStatus(
        printerStatus,
        connectedDeviceName,
      ),
      connectedDeviceName,
    })
  }, })


function safeDecode(value: string | undefined): string {
  if (!value) {
    return ''
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function describePrinterStatus(
  status: PrinterStatus,
  connectedDeviceName: string,
): string {
  switch (status) {
    case 'DISCOVERING':
      return '正在搜索附近的 T50 Pro'
    case 'CONNECTING':
      return '正在连接打印机'
    case 'READY':
      return connectedDeviceName
        ? `已连接：${connectedDeviceName}`
        : '打印机已连接'
    case 'PRINTING':
      return '正在打印标签'
    case 'DISCONNECTED':
      return '尚未连接打印机'
  }
}
