import type { ApiHandler } from '../types'

export const systemHandlers: Readonly<Record<string, ApiHandler>> = {
  ping: async (_payload, context) => ({
    service: 'sthmoving-cloud-api',
    openidAvailable: Boolean(context.openid),
  }),
}
