import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

import { ApiException } from '../../../cloudfunctions/api/src/errors'
import {
  parseSelfHostedPath,
  toSelfHostedReference,
} from '../../../cloudfunctions/api/src/storage/file-reference'
import type { RequestContext } from '../../../cloudfunctions/api/src/types'
import { PayloadTooLargeError, readBody, readJsonBody } from '../http/body'
import { sendApiError, sendApiResponse } from '../http/respond'
import type { HttpRoute } from '../http/server'
import type { FileRegistry } from './files'
import type { FileUrlSigner } from './signing'
import type { AllowedContentType, FilePurpose, FileStorage } from './storage'
import {
  extensionForContentType,
  isAllowedContentType,
  isFilePurpose,
  maxUploadBytes,
} from './storage'

const filePrefix = '/files/'
const uploadPath = '/files/uploads'
const maxUploadRequestBytes = 1024

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export interface FileRouteOptions {
  readonly storage: FileStorage
  readonly registry: FileRegistry
  readonly signer: FileUrlSigner
  readonly authenticate: (request: IncomingMessage) => Promise<RequestContext>
  readonly uploadTtlMilliseconds: number
  readonly now?: () => string
}

export function detectContentType(
  content: Buffer,
): AllowedContentType | null {
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (content.length >= 8 && content.subarray(0, 8).equals(pngSignature)) {
    return 'image/png'
  }
  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString('latin1') === 'RIFF' &&
    content.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export function describeFilePath(
  path: string,
): { purpose: FilePurpose; ownerId: string | null } | null {
  const segments = path.split('/')
  const [prefix, owner] = segments
  if (prefix === 'items' && segments.length === 3 && owner) {
    return { purpose: 'ITEM_IMAGE', ownerId: owner }
  }
  if (prefix === 'avatars' && segments.length === 3 && owner) {
    return { purpose: 'AVATAR', ownerId: owner }
  }
  if (prefix === 'labels' && segments.length === 3) {
    return { purpose: 'LABEL', ownerId: null }
  }
  return null
}

function filePathFromUrl(pathname: string): string | null {
  if (!pathname.startsWith(filePrefix)) {
    return null
  }
  return parseSelfHostedPath(
    toSelfHostedReference(pathname.slice(filePrefix.length)),
  )
}

export function createFileRoutes(
  options: FileRouteOptions,
): readonly HttpRoute[] {
  const now = options.now ?? (() => new Date().toISOString())

  return [
    {
      method: 'POST',
      match: (pathname) => pathname === uploadPath,
      handle: async (request, response) => {
        let context: RequestContext
        try {
          context = await options.authenticate(request)
        } catch (error) {
          if (!(error instanceof ApiException)) {
            throw error
          }
          sendApiError(response, error.code, error.message)
          return
        }

        let body: unknown
        try {
          body = await readJsonBody(request, maxUploadRequestBytes)
        } catch {
          sendApiError(response, 'INVALID_REQUEST', '上传申请请求体无效')
          return
        }

        const input = body as { purpose?: unknown; contentType?: unknown }
        if (
          !isFilePurpose(input.purpose) ||
          input.purpose === 'LABEL' ||
          !isAllowedContentType(input.contentType)
        ) {
          sendApiError(response, 'INVALID_REQUEST', '上传申请字段无效')
          return
        }

        const directory = input.purpose === 'AVATAR' ? 'avatars' : 'items'
        const extension = extensionForContentType(input.contentType)
        const path = `${directory}/${context.userId}/${randomUUID()}.${extension}`

        sendApiResponse(response, {
          ok: true,
          data: {
            reference: toSelfHostedReference(path),
            uploadUrl: options.signer.sign(
              'upload',
              path,
              options.uploadTtlMilliseconds,
            ),
          },
        })
      },
    },

    {
      method: 'PUT',
      match: (pathname) => pathname.startsWith(filePrefix),
      handle: async (request, response, url) => {
        const path = filePathFromUrl(url.pathname)
        const described = path ? describeFilePath(path) : null
        if (
          !path ||
          !described ||
          !options.signer.verify(
            'upload',
            path,
            url.searchParams.get('expires'),
            url.searchParams.get('signature'),
          )
        ) {
          sendApiError(response, 'FORBIDDEN', '上传地址无效或已过期')
          return
        }

        let content: Buffer
        try {
          content = await readBody(request, maxUploadBytes)
        } catch (error) {
          if (error instanceof PayloadTooLargeError) {
            sendApiError(response, 'PAYLOAD_TOO_LARGE', '文件超出大小限制')
            return
          }
          throw error
        }

        const contentType = detectContentType(content)
        if (!contentType) {
          sendApiError(response, 'INVALID_REQUEST', '只接受 JPEG、PNG 或 WebP 图片')
          return
        }

        await options.storage.write(path, content)
        await options.registry.record({
          path,
          purpose: described.purpose,
          ownerId: described.ownerId,
          contentType,
          sizeBytes: content.length,
          createdAt: now(),
        })

        sendApiResponse(response, {
          ok: true,
          data: { reference: toSelfHostedReference(path) },
        })
      },
    },

    {
      method: 'GET',
      match: (pathname) => pathname.startsWith(filePrefix),
      handle: async (_request, response, url) => {
        const path = filePathFromUrl(url.pathname)
        if (
          !path ||
          !options.signer.verify(
            'download',
            path,
            url.searchParams.get('expires'),
            url.searchParams.get('signature'),
          )
        ) {
          sendApiError(response, 'FORBIDDEN', '文件地址无效或已过期')
          return
        }

        const content = await options.storage.read(path)
        if (!content) {
          sendApiError(response, 'NOT_FOUND', '文件不存在')
          return
        }

        const record = await options.registry.get(path)
        response.writeHead(200, {
          'Content-Type': record?.contentType ?? 'application/octet-stream',
          'Content-Length': content.length,
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(content)
      },
    },
  ]
}
