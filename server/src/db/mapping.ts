export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): { [K in TKey]?: TValue } {
  return (value === null ? {} : { [key]: value }) as { [K in TKey]?: TValue }
}

export function optionalIso<TKey extends string>(
  key: TKey,
  value: Date | string | null,
): { [K in TKey]?: string } {
  return optional(key, value === null ? null : toIso(value))
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}
