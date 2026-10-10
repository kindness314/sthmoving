import { deriveUserId } from '../../../cloudfunctions/api/src/identity'
import type { MembershipRepository } from '../../../cloudfunctions/api/src/membership/repository'

/** 沙箱审核身份的固定标识；openid 只是占位，不参与任何微信校验。 */
export const sandboxOpenid = 'review:sandbox'

export const sandboxUserId = deriveUserId(sandboxOpenid)

/**
 * 确保沙箱内存在唯一的审核身份（所有者角色，可体验全部功能）。
 * 已存在时不覆盖，保留审核过程中的改动。
 */
export async function ensureSandboxOwner(
  membership: MembershipRepository,
  now: string,
): Promise<void> {
  await membership.runTransaction(async (unitOfWork) => {
    const existing = await unitOfWork.getUser(sandboxUserId)
    if (existing) {
      return
    }
    await unitOfWork.setUser({
      _id: sandboxUserId,
      openid: sandboxOpenid,
      display_name: '审核体验',
      role: 'OWNER',
      status: 'APPROVED',
      joined_at: now,
      created_at: now,
      updated_at: now,
    })
  })
}
