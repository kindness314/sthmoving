import { describeCategoryRepositoryContract } from './categories.contract'
import {
  inMemoryCategoryHarness,
  inMemoryItemHarness,
  inMemoryLabelHarness,
  inMemoryMembershipHarness,
  inMemoryOutboundHarness,
} from './in-memory'
import { describeItemRepositoryContract } from './items.contract'
import { describeLabelRepositoryContract } from './labels.contract'
import { describeMembershipRepositoryContract } from './membership.contract'
import { describeOutboundRepositoryContract } from './outbound.contract'

describeItemRepositoryContract(inMemoryItemHarness)
describeOutboundRepositoryContract(inMemoryOutboundHarness)
describeMembershipRepositoryContract(inMemoryMembershipHarness)
describeCategoryRepositoryContract(inMemoryCategoryHarness)
describeLabelRepositoryContract(inMemoryLabelHarness)
