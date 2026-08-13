import { ApiException } from '../../../cloudfunctions/api/src/errors'

interface PostgresError {
  readonly code: string
  readonly constraint: string | undefined
}

interface MappedError {
  readonly code: string
  readonly message: string
}

const uniqueViolations: Readonly<Record<string, MappedError>> = {
  users_openid_key: {
    code: 'IDENTITY_CONFLICT',
    message: '微信身份与既有账号不一致',
  },
  users_single_owner: {
    code: 'OWNER_BOOTSTRAP_CLOSED',
    message: '首位所有者已经初始化',
  },
  join_requests_one_pending_per_applicant: {
    code: 'JOIN_REQUEST_PENDING',
    message: '已有一条待审核申请，请勿重复提交',
  },
  categories_normalized_name_live: {
    code: 'CATEGORY_NAME_EXISTS',
    message: '分类名称已存在',
  },
  outbound_requests_one_pending_per_item: {
    code: 'OUTBOUND_REQUEST_PENDING',
    message: '该物品已有待处理的离库申请',
  },
}

const foreignKeyViolations: Readonly<Record<string, MappedError>> = {
  items_category_id_fkey: {
    code: 'CATEGORY_NOT_FOUND',
    message: '未找到分类',
  },
  item_labels_item_id_fkey: {
    code: 'ITEM_NOT_FOUND',
    message: '未找到物品',
  },
  item_operation_logs_item_id_fkey: {
    code: 'ITEM_NOT_FOUND',
    message: '未找到物品',
  },
  outbound_requests_item_id_fkey: {
    code: 'ITEM_NOT_FOUND',
    message: '未找到物品',
  },
  join_requests_applicant_id_fkey: {
    code: 'USER_NOT_FOUND',
    message: '未找到用户',
  },
  outbound_requests_applicant_id_fkey: {
    code: 'USER_NOT_FOUND',
    message: '未找到用户',
  },
}

const retryableCodes = new Set(['40001', '40P01'])

export function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }
  const candidate = error as { code?: unknown; constraint?: unknown }
  if (typeof candidate.code !== 'string') {
    return null
  }
  return {
    code: candidate.code,
    constraint:
      typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
  }
}

export function isRetryableDatabaseError(error: unknown): boolean {
  const postgresError = asPostgresError(error)
  return postgresError !== null && retryableCodes.has(postgresError.code)
}

export function translateDatabaseError(error: unknown): unknown {
  const postgresError = asPostgresError(error)
  if (postgresError === null) {
    return error
  }

  const mapped = mapPostgresError(postgresError)
  if (!mapped) {
    return error
  }
  return new ApiException(mapped.code, mapped.message)
}

function mapPostgresError(error: PostgresError): MappedError | null {
  switch (error.code) {
    case '23505':
      return (
        lookup(uniqueViolations, error.constraint) ?? {
          code: 'RESOURCE_CONFLICT',
          message: '数据已被其他操作修改，请重试',
        }
      )
    case '23503':
      return (
        lookup(foreignKeyViolations, error.constraint) ?? {
          code: 'RESOURCE_CONFLICT',
          message: '关联数据已不存在，请重试',
        }
      )
    case '23502':
    case '23514':
    case '22001':
      return {
        code: 'INVALID_REQUEST',
        message: '提交的数据不满足存储约束',
      }
    case '40001':
    case '40P01':
      return {
        code: 'RESOURCE_CONFLICT',
        message: '数据并发冲突，请重试',
      }
    case '53300':
    case '57014':
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: '服务繁忙，请稍后重试',
      }
    default:
      return null
  }
}

function lookup(
  table: Readonly<Record<string, MappedError>>,
  constraint: string | undefined,
): MappedError | null {
  return constraint ? (table[constraint] ?? null) : null
}
