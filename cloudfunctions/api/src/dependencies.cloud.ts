import { CloudCategoryRepository } from './categories/cloud-repository'
import { CloudStorageUrlResolver } from './cloud-storage'
import type { ApiDependencies } from './dependencies'
import { CloudItemRepository } from './items/cloud-repository'
import { CloudLabelRepository } from './labels/cloud-repository'
import { readMiniProgramEnvironment } from './labels/environment'
import {
  CloudLabelFileStorage,
  WeChatMiniProgramCodeGenerator,
} from './labels/external'
import { CloudMembershipRepository } from './membership/cloud-repository'
import { CloudOutboundRepository } from './outbound/cloud-repository'
import { CloudOutboundImageStorage } from './outbound/storage'

const miniProgramEnvironment = readMiniProgramEnvironment(
  process.env['MINI_PROGRAM_ENVIRONMENT'],
  'develop',
)

export function createCloudDependencies(): ApiDependencies {
  let membership: CloudMembershipRepository | undefined
  let categories: CloudCategoryRepository | undefined
  let items: CloudItemRepository | undefined
  let labels: CloudLabelRepository | undefined
  let outbound: CloudOutboundRepository | undefined
  let miniProgramCode: WeChatMiniProgramCodeGenerator | undefined
  let labelFiles: CloudLabelFileStorage | undefined
  let outboundImages: CloudOutboundImageStorage | undefined
  let storage: CloudStorageUrlResolver | undefined

  const urlResolver = () => (storage ??= new CloudStorageUrlResolver())

  return {
    get membership() {
      return (membership ??= new CloudMembershipRepository())
    },
    get categories() {
      return (categories ??= new CloudCategoryRepository())
    },
    get items() {
      return (items ??= new CloudItemRepository())
    },
    get labels() {
      return (labels ??= new CloudLabelRepository())
    },
    get outbound() {
      return (outbound ??= new CloudOutboundRepository())
    },
    get miniProgramCode() {
      return (miniProgramCode ??= new WeChatMiniProgramCodeGenerator())
    },
    get labelFiles() {
      return (labelFiles ??= new CloudLabelFileStorage())
    },
    get outboundImages() {
      return (outboundImages ??= new CloudOutboundImageStorage())
    },
    miniProgramEnvironment,
    resolveFileUrls: (fileIds) => urlResolver().resolve(fileIds),
    resolveFileUrl: (fileId) => urlResolver().resolveOne(fileId),
  }
}
