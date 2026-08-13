import type { Pool } from 'pg'

import type { CategoryRecord } from '../../cloudfunctions/api/src/categories/types'
import type { ItemRecord } from '../../cloudfunctions/api/src/items/types'
import type { UserRecord } from '../../cloudfunctions/api/src/membership/types'
import {
  upsertCategory,
  upsertItem,
  upsertJoinRequest,
  upsertLabel,
  upsertOperationLog,
  upsertOutboundRequest,
  upsertUser,
} from '../../server/src/repositories/rows'
import { getTestPool, truncateAll } from './postgres-support'
import type { RepositoryHarness, SeedData } from './support'

const placeholderTime = '2026-07-01T00:00:00.000Z'

function placeholderUser(id: string): UserRecord {
  return {
    _id: id,
    openid: `seeded-openid-${id}`,
    display_name: id.slice(0, 40),
    role: 'MEMBER',
    status: 'APPROVED',
    created_at: placeholderTime,
    updated_at: placeholderTime,
  }
}

function placeholderCategory(id: string): CategoryRecord {
  return {
    _id: id,
    name: id.slice(0, 40),
    normalized_name: `seeded-${id}`,
    status: 'ACTIVE',
    is_preset: false,
    sort_order: 1000,
    created_at: placeholderTime,
    updated_at: placeholderTime,
  }
}

function placeholderItem(
  id: string,
  code: string,
  categoryId: string,
  ownerId: string,
): ItemRecord {
  return {
    _id: id,
    code,
    name: id.slice(0, 100),
    images: [],
    description: '',
    quantity_mode: 'SINGLE',
    quantity: 1,
    category_id: categoryId,
    status: 'ACTIVE',
    version: 1,
    registered_by: ownerId,
    registered_at: placeholderTime,
    updated_by: ownerId,
    updated_at: placeholderTime,
  }
}

function placeholderCode(index: number): string {
  return index.toString(16).toUpperCase().padStart(12, 'F')
}

function collect(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

async function seedDatabase(pool: Pool, seed: SeedData): Promise<void> {
  const users = [...(seed.users ?? [])]
  const categories = [...(seed.categories ?? [])]
  const items = [...(seed.items ?? [])]

  const referencedUsers = collect([
    ...(seed.joinRequests ?? []).map((row) => row.applicant_id),
    ...(seed.outboundRequests ?? []).map((row) => row.applicant_id),
  ])
  const referencedCategories = collect(items.map((row) => row.category_id))
  const referencedItems = collect([
    ...(seed.labels ?? []).map((row) => row.item_id),
    ...(seed.operationLogs ?? []).map((row) => row.item_id),
    ...(seed.outboundRequests ?? []).map((row) => row.item_id),
  ])

  const knownUsers = new Set(users.map((row) => row._id))
  for (const id of referencedUsers) {
    if (!knownUsers.has(id)) {
      users.push(placeholderUser(id))
      knownUsers.add(id)
    }
  }

  const knownCategories = new Set(categories.map((row) => row._id))
  for (const id of referencedCategories) {
    if (!knownCategories.has(id)) {
      categories.push(placeholderCategory(id))
      knownCategories.add(id)
    }
  }

  const knownItems = new Set(items.map((row) => row._id))
  const missingItems = referencedItems.filter((id) => !knownItems.has(id))
  if (missingItems.length > 0) {
    const ownerId = users[0]?._id ?? 'seeded-user'
    if (!knownUsers.has(ownerId)) {
      users.push(placeholderUser(ownerId))
      knownUsers.add(ownerId)
    }
    const categoryId = categories[0]?._id ?? 'seeded-category'
    if (!knownCategories.has(categoryId)) {
      categories.push(placeholderCategory(categoryId))
      knownCategories.add(categoryId)
    }
    const usedCodes = new Set(items.map((row) => row.code))
    let codeIndex = 0
    for (const id of missingItems) {
      let code = placeholderCode(codeIndex++)
      while (usedCodes.has(code)) {
        code = placeholderCode(codeIndex++)
      }
      usedCodes.add(code)
      items.push(placeholderItem(id, code, categoryId, ownerId))
      knownItems.add(id)
    }
  }

  for (const user of users) {
    await upsertUser(pool, user)
  }
  for (const category of categories) {
    await upsertCategory(pool, category)
  }
  for (const item of items) {
    await upsertItem(pool, item)
  }
  for (const label of seed.labels ?? []) {
    await upsertLabel(pool, label)
  }
  for (const log of seed.operationLogs ?? []) {
    await upsertOperationLog(pool, log)
  }
  for (const request of seed.joinRequests ?? []) {
    await upsertJoinRequest(pool, request)
  }
  for (const request of seed.outboundRequests ?? []) {
    await upsertOutboundRequest(pool, request)
  }
}

export function createPostgresHarness<TRepository>(
  build: (pool: Pool) => TRepository,
): RepositoryHarness<TRepository> {
  return {
    name: 'PostgreSQL',
    async create(seed?: SeedData) {
      const pool = await getTestPool()
      await truncateAll(pool)
      await seedDatabase(pool, seed ?? {})
      return build(pool)
    },
    dispose() {
      return Promise.resolve()
    },
  }
}
