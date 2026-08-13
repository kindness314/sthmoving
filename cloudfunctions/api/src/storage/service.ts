import { ApiException } from '../errors'
import type { MembershipRepository } from '../membership/repository'
import type { UserRecord } from '../membership/types'
import { isFileOwnedBy, isManagedFileReference } from './file-reference'

export const maxFileBatchSize = 20

function validateFileIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maxFileBatchSize) {
    throw new ApiException('INVALID_REQUEST', '文件列表无效')
  }
  const fileIds = input.map((fileId) =>
    typeof fileId === 'string' ? fileId.trim() : '',
  )
  if (fileIds.some((fileId) => !isManagedFileReference(fileId))) {
    throw new ApiException('INVALID_REQUEST', '文件引用无效')
  }
  return [...new Set(fileIds)]
}

export class StorageService {
  constructor(
    private readonly repository: MembershipRepository,
    private readonly resolveFileUrls: (
      fileIds: string[],
    ) => Promise<Map<string, string>>,
    private readonly deleteFiles: (fileIds: readonly string[]) => Promise<void>,
  ) {}

  async resolve(
    userId: string,
    input: unknown,
  ): Promise<Record<string, string>> {
    const fileIds = validateFileIds(input)
    await this.requireApprovedUser(userId)
    return Object.fromEntries(await this.resolveFileUrls(fileIds))
  }

  async discard(userId: string, input: unknown): Promise<{ discarded: number }> {
    const fileIds = validateFileIds(input)
    const user = await this.requireApprovedUser(userId)
    const owned = fileIds.filter((fileId) => isFileOwnedBy(fileId, user._id))
    if (owned.length > 0) {
      await this.deleteFiles(owned)
    }
    return { discarded: owned.length }
  }

  private async requireApprovedUser(userId: string): Promise<UserRecord> {
    const user = await this.repository.runTransaction((unitOfWork) =>
      unitOfWork.getUser(userId),
    )
    if (!user) {
      throw new ApiException('USER_NOT_FOUND', '未找到用户')
    }
    if (user.status === 'DISABLED') {
      throw new ApiException('ACCOUNT_DISABLED', '当前账号已被停用')
    }
    if (user.status !== 'APPROVED') {
      throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
    }
    return user
  }
}
