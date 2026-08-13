import type { Pool } from 'pg'

import type { ApiDependencies } from '../../cloudfunctions/api/src/dependencies'
import { PostgresCategoryRepository } from './repositories/categories'
import { PostgresItemRepository } from './repositories/items'
import { PostgresLabelRepository } from './repositories/labels'
import { PostgresMembershipRepository } from './repositories/membership'
import { PostgresOutboundRepository } from './repositories/outbound'

export type ExternalDependencies = Omit<
  ApiDependencies,
  'membership' | 'categories' | 'items' | 'labels' | 'outbound'
>

export function createPgDependencies(
  pool: Pool,
  external: ExternalDependencies,
): ApiDependencies {
  return {
    membership: new PostgresMembershipRepository(pool),
    categories: new PostgresCategoryRepository(pool),
    items: new PostgresItemRepository(pool),
    labels: new PostgresLabelRepository(pool),
    outbound: new PostgresOutboundRepository(pool),
    ...external,
  }
}
