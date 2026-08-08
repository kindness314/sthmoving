import { ApiException } from '../errors'
import { CloudNotificationRepository } from '../notifications/cloud-repository'
import { NotificationService } from '../notifications/service'
import type { ApiHandler } from '../types'

interface MarkReadPayload {
  notificationId?: unknown
}

function createService(): NotificationService {
  return new NotificationService(new CloudNotificationRepository())
}

export const notificationHandlers: Readonly<Record<string, ApiHandler>> = {
  list: async (_payload, context) => createService().list(context.openid),

  markRead: async (payload, context) => {
    const input = payload as MarkReadPayload | undefined
    if (typeof input?.notificationId !== 'string') {
      throw new ApiException('INVALID_NOTIFICATION_ID', '提醒 ID 无效')
    }
    return createService().markRead(context.openid, input.notificationId)
  },
}
