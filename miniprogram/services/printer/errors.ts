export type PrinterErrorCode =
  | 'BLUETOOTH_INITIALIZATION_FAILED'
  | 'BLUETOOTH_UNAVAILABLE'
  | 'DISCOVERY_FAILED'
  | 'CONNECTION_FAILED'
  | 'DISCONNECT_FAILED'
  | 'NOT_CONNECTED'
  | 'PRINTER_BUSY'
  | 'RENDER_CONTEXT_MISSING'
  | 'IMAGE_DOWNLOAD_FAILED'
  | 'IMAGE_RENDER_FAILED'
  | 'COVER_OPEN'
  | 'MEDIA_NOT_INSTALLED'
  | 'MEDIA_LOW'
  | 'MEDIA_UNRECOGNIZED'
  | 'MEDIA_EMPTY'
  | 'PRINT_ABORTED'
  | 'RIBBON_ERROR'
  | 'COMPRESSION_FAILED'
  | 'PRINT_DATA_EMPTY'
  | 'SDK_ERROR'

const messages: Record<PrinterErrorCode, string> = {
  BLUETOOTH_INITIALIZATION_FAILED: '蓝牙初始化失败，请重试',
  BLUETOOTH_UNAVAILABLE: '手机蓝牙不可用，请开启蓝牙后重试',
  DISCOVERY_FAILED: '搜索打印机失败，请重试',
  CONNECTION_FAILED: '连接打印机失败，请确认设备已开机',
  DISCONNECT_FAILED: '断开打印机失败，请重试',
  NOT_CONNECTED: '请先连接打印机',
  PRINTER_BUSY: '打印机正在处理任务，请稍候',
  RENDER_CONTEXT_MISSING: '打印画布尚未初始化，请重新进入页面',
  IMAGE_DOWNLOAD_FAILED: '下载小程序码图片失败，请检查网络后重试',
  IMAGE_RENDER_FAILED: '生成打印图片失败，请重试',
  COVER_OPEN: '请关闭打印机耗材仓盖',
  MEDIA_NOT_INSTALLED: '未正确安装标签纸',
  MEDIA_LOW: '标签纸余量不足，请检查耗材',
  MEDIA_UNRECOGNIZED: '打印机无法识别当前标签纸',
  MEDIA_EMPTY: '标签纸已用完，请更换耗材',
  PRINT_ABORTED: '打印异常终止，请检查打印机状态',
  RIBBON_ERROR: '打印机色带状态异常',
  COMPRESSION_FAILED: '打印数据压缩失败，请重试',
  PRINT_DATA_EMPTY: '打印图片数据为空',
  SDK_ERROR: '打印机发生未预期错误',
}

export class PrinterError extends Error {
  readonly code: PrinterErrorCode
  readonly sdkResultCode?: number
  readonly originalCause?: unknown

  constructor(
    code: PrinterErrorCode,
    options: { sdkResultCode?: number; cause?: unknown } = {},
  ) {
    super(messages[code])
    this.name = 'PrinterError'
    this.code = code
    if (options.sdkResultCode !== undefined) {
      this.sdkResultCode = options.sdkResultCode
    }
    if (options.cause !== undefined) {
      this.originalCause = options.cause
    }
  }
}
