import type {
  LabelFileStorage,
} from '../../../cloudfunctions/api/src/labels/external'
import type { OutboundImageStorage } from '../../../cloudfunctions/api/src/outbound/storage'
import {
  parseSelfHostedPath,
  toSelfHostedReference,
} from '../../../cloudfunctions/api/src/storage/file-reference'
import type { FileRegistry } from './files'
import type { FileUrlSigner } from './signing'
import type { FileStorage } from './storage'

export interface FileServices {
  readonly labelFiles: LabelFileStorage
  readonly outboundImages: OutboundImageStorage
  readonly resolveFileUrls: (fileIds: string[]) => Promise<Map<string, string>>
  readonly resolveFileUrl: (fileId: string) => Promise<string>
}

export interface FileServiceOptions {
  readonly storage: FileStorage
  readonly registry: FileRegistry
  readonly signer: FileUrlSigner
  readonly downloadTtlMilliseconds: number
  readonly now?: () => string
}

export function labelPath(itemId: string, publicCode: string): string {
  return `labels/${itemId}/${publicCode}.png`
}

export function createFileServices(options: FileServiceOptions): FileServices {
  const now = options.now ?? (() => new Date().toISOString())

  const signDownload = (path: string) =>
    options.signer.sign('download', path, options.downloadTtlMilliseconds)

  return {
    labelFiles: {
      upload: async (itemId, publicCode, content) => {
        const path = labelPath(itemId, publicCode)
        if (parseSelfHostedPath(toSelfHostedReference(path)) === null) {
          throw new Error('标签文件路径无效')
        }
        await options.storage.write(path, content)
        await options.registry.record({
          path,
          purpose: 'LABEL',
          ownerId: null,
          contentType: 'image/png',
          sizeBytes: content.length,
          createdAt: now(),
        })
        return toSelfHostedReference(path)
      },
    },

    outboundImages: {
      delete: async (fileIds) => {
        const paths = [...new Set(fileIds)]
          .map((fileId) => parseSelfHostedPath(fileId))
          .filter((path): path is string => path !== null)
        if (paths.length === 0) {
          return
        }
        await options.storage.delete(paths)
        await options.registry.remove(paths)
      },
    },

    resolveFileUrls: async (fileIds) => {
      const urls = new Map<string, string>()
      for (const fileId of new Set(fileIds)) {
        const path = parseSelfHostedPath(fileId)
        if (path) {
          urls.set(fileId, signDownload(path))
        }
      }
      return urls
    },

    resolveFileUrl: async (fileId) => {
      const path = parseSelfHostedPath(fileId)
      if (!path) {
        throw new Error('文件引用无效')
      }
      return signDownload(path)
    },
  }
}
