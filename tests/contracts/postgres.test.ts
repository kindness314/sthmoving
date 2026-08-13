import { afterAll } from 'vitest'

import { PostgresCategoryRepository } from '../../server/src/repositories/categories'
import { PostgresItemRepository } from '../../server/src/repositories/items'
import { PostgresLabelRepository } from '../../server/src/repositories/labels'
import { PostgresMembershipRepository } from '../../server/src/repositories/membership'
import { PostgresOutboundRepository } from '../../server/src/repositories/outbound'
import { describeCategoryRepositoryContract } from './categories.contract'
import { describeItemRepositoryContract } from './items.contract'
import { describeLabelRepositoryContract } from './labels.contract'
import { describeMembershipRepositoryContract } from './membership.contract'
import { describeOutboundRepositoryContract } from './outbound.contract'
import { createPostgresHarness } from './postgres'
import { closeTestPool, describePostgres } from './postgres-support'

describePostgres('PostgreSQL 仓储契约', () => {
  afterAll(async () => {
    await closeTestPool()
  })

  describeItemRepositoryContract(
    createPostgresHarness((pool) => new PostgresItemRepository(pool)),
  )
  describeOutboundRepositoryContract(
    createPostgresHarness((pool) => new PostgresOutboundRepository(pool)),
  )
  describeMembershipRepositoryContract(
    createPostgresHarness((pool) => new PostgresMembershipRepository(pool)),
  )
  describeCategoryRepositoryContract(
    createPostgresHarness((pool) => new PostgresCategoryRepository(pool)),
  )
  describeLabelRepositoryContract(
    createPostgresHarness((pool) => new PostgresLabelRepository(pool)),
  )
})
