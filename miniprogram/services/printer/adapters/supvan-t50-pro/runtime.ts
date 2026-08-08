import {
  SupvanT50ProAdapter,
  type SupvanBleTool,
  type SupvanPrintManager,
} from './adapter'

declare const require: <T>(path: string) => T | { default: T }

const bleTool = unwrapDefault(
  require<SupvanBleTool>(
    '../../../../vendor/supvan-t50-pro/SUPVANAPIT50PRO/BLETool.js',
  ),
)
const printManager = unwrapDefault(
  require<SupvanPrintManager>(
    '../../../../vendor/supvan-t50-pro/SUPVANAPIT50PRO/BLEToothManage.js',
  ),
)

export const supvanT50ProPrinter = new SupvanT50ProAdapter({
  bleTool,
  printManager,
})

function unwrapDefault<T>(value: T | { default: T }): T {
  if (
    value &&
    typeof value === 'object' &&
    'default' in value
  ) {
    return value.default
  }
  return value
}
