import type { CategoryRepository } from './categories/repository'
import type { ItemRepository } from './items/repository'
import type {
  LabelFileStorage,
  MiniProgramCodeGenerator,
  MiniProgramEnvironment,
} from './labels/external'
import type { LabelRepository } from './labels/repository'
import type { MembershipRepository } from './membership/repository'
import type { OutboundRepository } from './outbound/repository'
import type { OutboundImageStorage } from './outbound/storage'

export interface ApiDependencies {
  readonly membership: MembershipRepository
  readonly categories: CategoryRepository
  readonly items: ItemRepository
  readonly labels: LabelRepository
  readonly outbound: OutboundRepository
  readonly miniProgramCode: MiniProgramCodeGenerator
  readonly labelFiles: LabelFileStorage
  readonly outboundImages: OutboundImageStorage
  readonly miniProgramEnvironment: MiniProgramEnvironment
  readonly resolveFileUrls: (
    fileIds: string[],
  ) => Promise<Map<string, string>>
  readonly resolveFileUrl: (fileId: string) => Promise<string>
}
