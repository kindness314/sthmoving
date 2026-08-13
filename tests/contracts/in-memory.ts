import type {
  CategoryRepository,
  CategoryUnitOfWork,
} from '../../cloudfunctions/api/src/categories/repository'
import type { CategoryRecord } from '../../cloudfunctions/api/src/categories/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from '../../cloudfunctions/api/src/items/repository'
import type {
  ItemListQuery,
  ItemOperationLogRecord,
  ItemRecord,
} from '../../cloudfunctions/api/src/items/types'
import type {
  LabelRepository,
  LabelUnitOfWork,
} from '../../cloudfunctions/api/src/labels/repository'
import type { ItemLabelRecord } from '../../cloudfunctions/api/src/labels/types'
import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from '../../cloudfunctions/api/src/membership/repository'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../../cloudfunctions/api/src/membership/types'
import type {
  OutboundRepository,
  OutboundUnitOfWork,
} from '../../cloudfunctions/api/src/outbound/repository'
import type { OutboundRequestRecord } from '../../cloudfunctions/api/src/outbound/types'
import type { RepositoryHarness, SeedData } from './support'

interface Store {
  users: Map<string, UserRecord>
  categories: Map<string, CategoryRecord>
  items: Map<string, ItemRecord>
  labels: Map<string, ItemLabelRecord>
  operationLogs: Map<string, ItemOperationLogRecord>
  joinRequests: Map<string, JoinRequestRecord>
  outboundRequests: Map<string, OutboundRequestRecord>
}

function toMap<TRecord extends { _id: string }>(
  records: TRecord[] | undefined,
): Map<string, TRecord> {
  return new Map(
    (records ?? []).map((record) => [record._id, structuredClone(record)]),
  )
}

function createStore(seed: SeedData = {}): Store {
  return {
    users: toMap(seed.users),
    categories: toMap(seed.categories),
    items: toMap(seed.items),
    labels: toMap(seed.labels),
    operationLogs: toMap(seed.operationLogs),
    joinRequests: toMap(seed.joinRequests),
    outboundRequests: toMap(seed.outboundRequests),
  }
}

function cloneStore(store: Store): Store {
  return {
    users: toMap([...store.users.values()]),
    categories: toMap([...store.categories.values()]),
    items: toMap([...store.items.values()]),
    labels: toMap([...store.labels.values()]),
    operationLogs: toMap([...store.operationLogs.values()]),
    joinRequests: toMap([...store.joinRequests.values()]),
    outboundRequests: toMap([...store.outboundRequests.values()]),
  }
}

function commit(target: Store, source: Store): void {
  target.users = source.users
  target.categories = source.categories
  target.items = source.items
  target.labels = source.labels
  target.operationLogs = source.operationLogs
  target.joinRequests = source.joinRequests
  target.outboundRequests = source.outboundRequests
}

function compareDesc(left: string, right: string): number {
  if (left === right) {
    return 0
  }
  return left < right ? 1 : -1
}

function visibleItem(item: ItemRecord | undefined): ItemRecord | null {
  return item && item.status !== 'DELETED' ? structuredClone(item) : null
}

function visibleCategory(
  category: CategoryRecord | undefined,
): CategoryRecord | null {
  return category && category.status !== 'DELETED'
    ? structuredClone(category)
    : null
}

class InMemoryItemUnitOfWork implements ItemUnitOfWork {
  constructor(private readonly store: Store) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.users.get(userId) ?? null),
    )
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return Promise.resolve(visibleCategory(this.store.categories.get(categoryId)))
  }

  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    return Promise.resolve(
      visibleCategory(
        [...this.store.categories.values()].find(
          (category) => category.normalized_name === normalizedName,
        ),
      ),
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(visibleItem(this.store.items.get(itemId)))
  }

  setCategory(category: CategoryRecord): Promise<void> {
    this.store.categories.set(category._id, structuredClone(category))
    return Promise.resolve()
  }

  setItem(item: ItemRecord): Promise<void> {
    this.store.items.set(item._id, structuredClone(item))
    return Promise.resolve()
  }

  setLabel(label: ItemLabelRecord): Promise<void> {
    this.store.labels.set(label._id, structuredClone(label))
    return Promise.resolve()
  }

  setOperationLog(log: ItemOperationLogRecord): Promise<void> {
    this.store.operationLogs.set(log._id, structuredClone(log))
    return Promise.resolve()
  }
}

class InMemoryItemRepository implements ItemRepository {
  constructor(private readonly store: Store) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.users.get(userId) ?? null),
    )
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return Promise.resolve(visibleCategory(this.store.categories.get(categoryId)))
  }

  getCategoriesByIds(categoryIds: string[]): Promise<CategoryRecord[]> {
    const unique = [...new Set(categoryIds)]
    return Promise.resolve(
      unique
        .map((id) => visibleCategory(this.store.categories.get(id)))
        .filter((category): category is CategoryRecord => category !== null),
    )
  }

  getUsersByIds(userIds: string[]): Promise<UserRecord[]> {
    const unique = [...new Set(userIds)]
    return Promise.resolve(
      unique
        .map((id) => this.store.users.get(id))
        .filter((user): user is UserRecord => user !== undefined)
        .map((user) => structuredClone(user)),
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(visibleItem(this.store.items.get(itemId)))
  }

  listOperationLogs(itemId: string): Promise<ItemOperationLogRecord[]> {
    return Promise.resolve(
      [...this.store.operationLogs.values()]
        .filter((log) => log.item_id === itemId)
        .sort(
          (left, right) =>
            compareDesc(left.created_at, right.created_at) ||
            compareDesc(left._id, right._id),
        )
        .slice(0, 100)
        .map((log) => structuredClone(log)),
    )
  }

  listItems(query: ItemListQuery): Promise<ItemRecord[]> {
    const statuses = query.status
      ? [query.status]
      : ['ACTIVE', 'OUTBOUND_PENDING']
    const keyword = query.keyword?.toLocaleLowerCase('zh-CN')
    const matched = [...this.store.items.values()]
      .filter((item) => item.status !== 'DELETED')
      .filter((item) => statuses.includes(item.status))
      .filter((item) =>
        query.categoryId ? item.category_id === query.categoryId : true,
      )
      .filter((item) => {
        if (!keyword) {
          return true
        }
        return (
          item.name.toLocaleLowerCase('zh-CN').includes(keyword) ||
          item.description.toLocaleLowerCase('zh-CN').includes(keyword) ||
          item.code.toLocaleLowerCase('zh-CN').includes(keyword)
        )
      })
      .sort(
        (left, right) =>
          compareDesc(left.updated_at, right.updated_at) ||
          compareDesc(left._id, right._id),
      )
    const cursor = query.cursor
    const afterCursor = cursor
      ? matched.filter(
          (item) =>
            item.updated_at < cursor.updatedAt ||
            (item.updated_at === cursor.updatedAt && item._id < cursor.id),
        )
      : matched
    return Promise.resolve(
      afterCursor.slice(0, query.limit).map((item) => structuredClone(item)),
    )
  }

  async runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStore(this.store)
    const result = await operation(new InMemoryItemUnitOfWork(draft))
    commit(this.store, draft)
    return result
  }
}

class InMemoryCategoryUnitOfWork implements CategoryUnitOfWork {
  constructor(private readonly store: Store) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.users.get(userId) ?? null),
    )
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return Promise.resolve(visibleCategory(this.store.categories.get(categoryId)))
  }

  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    return Promise.resolve(
      visibleCategory(
        [...this.store.categories.values()].find(
          (category) => category.normalized_name === normalizedName,
        ),
      ),
    )
  }

  hasItemReference(categoryId: string): Promise<boolean> {
    return Promise.resolve(
      [...this.store.items.values()].some(
        (item) => item.category_id === categoryId && item.status !== 'DELETED',
      ),
    )
  }

  setCategory(category: CategoryRecord): Promise<void> {
    this.store.categories.set(category._id, structuredClone(category))
    return Promise.resolve()
  }

  listActiveCategories(): Promise<CategoryRecord[]> {
    return Promise.resolve(
      [...this.store.categories.values()]
        .filter((category) => category.status === 'ACTIVE')
        .map((category) => structuredClone(category)),
    )
  }

  listAllCategories(): Promise<CategoryRecord[]> {
    return Promise.resolve(
      [...this.store.categories.values()]
        .filter((category) => category.status !== 'DELETED')
        .map((category) => structuredClone(category)),
    )
  }
}

class InMemoryCategoryRepository implements CategoryRepository {
  constructor(private readonly store: Store) {}

  async runTransaction<T>(
    operation: (unitOfWork: CategoryUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStore(this.store)
    const result = await operation(new InMemoryCategoryUnitOfWork(draft))
    commit(this.store, draft)
    return result
  }
}

class InMemoryLabelUnitOfWork implements LabelUnitOfWork {
  constructor(private readonly store: Store) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.users.get(userId) ?? null),
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(visibleItem(this.store.items.get(itemId)))
  }

  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    return Promise.resolve(
      structuredClone(
        [...this.store.labels.values()].find(
          (label) => label.item_id === itemId,
        ) ?? null,
      ),
    )
  }

  getLabelByPublicCode(
    publicCode: string,
  ): Promise<ItemLabelRecord | null> {
    return Promise.resolve(
      structuredClone(
        [...this.store.labels.values()].find(
          (label) => label.public_code === publicCode,
        ) ?? null,
      ),
    )
  }

  setLabel(label: ItemLabelRecord): Promise<void> {
    this.store.labels.set(label._id, structuredClone(label))
    return Promise.resolve()
  }
}

class InMemoryLabelRepository implements LabelRepository {
  constructor(private readonly store: Store) {}

  async runTransaction<T>(
    operation: (unitOfWork: LabelUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStore(this.store)
    const result = await operation(new InMemoryLabelUnitOfWork(draft))
    commit(this.store, draft)
    return result
  }
}

class InMemoryMembershipUnitOfWork implements MembershipUnitOfWork {
  constructor(private readonly store: Store) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.users.get(userId) ?? null),
    )
  }

  setUser(user: UserRecord): Promise<void> {
    this.store.users.set(user._id, structuredClone(user))
    return Promise.resolve()
  }

  countOwners(): Promise<number> {
    return Promise.resolve(
      [...this.store.users.values()].filter((user) => user.role === 'OWNER')
        .length,
    )
  }

  countManagers(): Promise<number> {
    return Promise.resolve(
      [...this.store.users.values()].filter(
        (user) => user.role === 'MANAGER' && user.status === 'APPROVED',
      ).length,
    )
  }

  findPendingJoinRequest(
    applicantId: string,
  ): Promise<JoinRequestRecord | null> {
    return Promise.resolve(
      structuredClone(
        [...this.store.joinRequests.values()].find(
          (request) =>
            request.applicant_id === applicantId &&
            request.status === 'PENDING',
        ) ?? null,
      ),
    )
  }

  getJoinRequest(requestId: string): Promise<JoinRequestRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.joinRequests.get(requestId) ?? null),
    )
  }

  setJoinRequest(request: JoinRequestRecord): Promise<void> {
    this.store.joinRequests.set(request._id, structuredClone(request))
    return Promise.resolve()
  }

  listPendingJoinRequests(limit: number): Promise<JoinRequestRecord[]> {
    return Promise.resolve(
      [...this.store.joinRequests.values()]
        .filter((request) => request.status === 'PENDING')
        .sort(
          (left, right) =>
            compareDesc(left.created_at, right.created_at) ||
            compareDesc(left._id, right._id),
        )
        .slice(0, limit)
        .map((request) => structuredClone(request)),
    )
  }

  listUsers(limit: number): Promise<UserRecord[]> {
    return Promise.resolve(
      [...this.store.users.values()]
        .sort(
          (left, right) =>
            compareDesc(left.created_at, right.created_at) ||
            compareDesc(left._id, right._id),
        )
        .slice(0, limit)
        .map((user) => structuredClone(user)),
    )
  }
}

class InMemoryMembershipRepository implements MembershipRepository {
  constructor(private readonly store: Store) {}

  async runTransaction<T>(
    operation: (unitOfWork: MembershipUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStore(this.store)
    const result = await operation(new InMemoryMembershipUnitOfWork(draft))
    commit(this.store, draft)
    return result
  }
}

class InMemoryOutboundUnitOfWork implements OutboundUnitOfWork {
  constructor(private readonly store: Store) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.users.get(userId) ?? null),
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(visibleItem(this.store.items.get(itemId)))
  }

  getRequest(requestId: string): Promise<OutboundRequestRecord | null> {
    return Promise.resolve(
      structuredClone(this.store.outboundRequests.get(requestId) ?? null),
    )
  }

  findPendingRequest(
    itemId: string,
  ): Promise<OutboundRequestRecord | null> {
    return Promise.resolve(
      structuredClone(
        [...this.store.outboundRequests.values()].find(
          (request) =>
            request.item_id === itemId && request.status === 'PENDING',
        ) ?? null,
      ),
    )
  }

  listPendingRequests(limit: number): Promise<OutboundRequestRecord[]> {
    return Promise.resolve(
      [...this.store.outboundRequests.values()]
        .filter((request) => request.status === 'PENDING')
        .sort(
          (left, right) =>
            compareDesc(left.created_at, right.created_at) ||
            compareDesc(left._id, right._id),
        )
        .slice(0, limit)
        .map((request) => structuredClone(request)),
    )
  }

  listRequestsByApplicant(
    applicantId: string,
    limit: number,
  ): Promise<OutboundRequestRecord[]> {
    return Promise.resolve(
      [...this.store.outboundRequests.values()]
        .filter((request) => request.applicant_id === applicantId)
        .sort(
          (left, right) =>
            compareDesc(left.created_at, right.created_at) ||
            compareDesc(left._id, right._id),
        )
        .slice(0, limit)
        .map((request) => structuredClone(request)),
    )
  }

  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    return Promise.resolve(
      structuredClone(
        [...this.store.labels.values()].find(
          (label) => label.item_id === itemId,
        ) ?? null,
      ),
    )
  }

  setItem(item: ItemRecord): Promise<void> {
    this.store.items.set(item._id, structuredClone(item))
    return Promise.resolve()
  }

  setRequest(request: OutboundRequestRecord): Promise<void> {
    this.store.outboundRequests.set(request._id, structuredClone(request))
    return Promise.resolve()
  }

  setLabel(label: ItemLabelRecord): Promise<void> {
    this.store.labels.set(label._id, structuredClone(label))
    return Promise.resolve()
  }

  setOperationLog(log: ItemOperationLogRecord): Promise<void> {
    this.store.operationLogs.set(log._id, structuredClone(log))
    return Promise.resolve()
  }
}

class InMemoryOutboundRepository implements OutboundRepository {
  constructor(private readonly store: Store) {}

  async runTransaction<T>(
    operation: (unitOfWork: OutboundUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStore(this.store)
    const result = await operation(new InMemoryOutboundUnitOfWork(draft))
    commit(this.store, draft)
    return result
  }
}

function createHarness<TRepository>(
  build: (store: Store) => TRepository,
): RepositoryHarness<TRepository> {
  return {
    name: 'InMemory',
    create(seed?: SeedData) {
      return Promise.resolve(build(createStore(seed)))
    },
    dispose() {
      return Promise.resolve()
    },
  }
}

export const inMemoryItemHarness = createHarness<ItemRepository>(
  (store) => new InMemoryItemRepository(store),
)

export const inMemoryCategoryHarness = createHarness<CategoryRepository>(
  (store) => new InMemoryCategoryRepository(store),
)

export const inMemoryLabelHarness = createHarness<LabelRepository>(
  (store) => new InMemoryLabelRepository(store),
)

export const inMemoryMembershipHarness = createHarness<MembershipRepository>(
  (store) => new InMemoryMembershipRepository(store),
)

export const inMemoryOutboundHarness = createHarness<OutboundRepository>(
  (store) => new InMemoryOutboundRepository(store),
)
