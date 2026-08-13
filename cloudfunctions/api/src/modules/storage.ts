import type { ApiDependencies } from '../dependencies'
import { StorageService } from '../storage/service'
import type { ApiHandler } from '../types'

interface FilesPayload {
  fileIds?: unknown
}

function createService(deps: ApiDependencies): StorageService {
  return new StorageService(
    deps.membership,
    deps.resolveFileUrls,
    (fileIds) => deps.outboundImages.delete(fileIds),
  )
}

export function createStorageHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
    resolve: async (payload, context) =>
      createService(deps).resolve(
        context.userId,
        (payload as FilesPayload | undefined)?.fileIds,
      ),

    discard: async (payload, context) =>
      createService(deps).discard(
        context.userId,
        (payload as FilesPayload | undefined)?.fileIds,
      ),
  }
}
