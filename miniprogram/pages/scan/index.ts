import { parseScanTarget } from './parser'

Page({
  data: {
    scanning: false,
    errorMessage: '',
    autoStarted: false,
  },

  onShow() {
    if (this.data.autoStarted) {
      return
    }
    this.setData({ autoStarted: true })
    void this.startScan()
  },

  handleScan() {
    void this.startScan()
  },

  async startScan() {
    if (this.data.scanning) {
      return
    }
    this.setData({ scanning: true, errorMessage: '' })
    try {
      const result = await wx.scanCode({
        onlyFromCamera: false,
        scanType: ['wxCode', 'qrCode', 'barCode'],
      })
      const target = parseScanTarget(result as unknown as Record<string, unknown>)
      if (!target) {
        throw new Error('未识别到物品标签')
      }
      await wx.navigateTo({ url: target })
    } catch (error) {
      const message = getScanErrorMessage(error)
      if (!isScanCancelled(error)) {
        this.setData({ errorMessage: message })
      }
    } finally {
      this.setData({ scanning: false })
    }
  },
})

function isScanCancelled(error: unknown): boolean {
  const message = getScanErrorMessage(error).toLowerCase()
  return message.includes('scan:fail cancel') || message.includes('cancel')
}

function getScanErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'errMsg' in error &&
    typeof error.errMsg === 'string'
  ) {
    return error.errMsg
  }
  return '扫码失败，请重试'
}
