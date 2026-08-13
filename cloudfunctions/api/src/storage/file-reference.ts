export const maxFileReferenceLength = 500

export const selfHostedFilePrefix = 'file://'

const pathSegment = '[A-Za-z0-9][A-Za-z0-9._-]*'
const selfHostedPathPattern = new RegExp(`^${pathSegment}(?:/${pathSegment})*$`)

export function parseSelfHostedPath(fileId: string): string | null {
  if (!fileId.startsWith(selfHostedFilePrefix)) {
    return null
  }
  const path = fileId.slice(selfHostedFilePrefix.length)
  return selfHostedPathPattern.test(path) ? path : null
}

export function toSelfHostedReference(path: string): string {
  return `${selfHostedFilePrefix}${path}`
}

export function isManagedFileReference(fileId: string): boolean {
  if (fileId.length > maxFileReferenceLength) {
    return false
  }
  if (fileId.startsWith(selfHostedFilePrefix)) {
    return parseSelfHostedPath(fileId) !== null
  }
  return fileId.startsWith('cloud://')
}

export function isAvatarOwnedBy(fileId: string, userId: string): boolean {
  return fileId.includes(`/avatars/${userId}/`)
}

export function isFileOwnedBy(fileId: string, userId: string): boolean {
  const path = parseSelfHostedPath(fileId)
  if (path === null) {
    return false
  }
  const segments = path.split('/')
  return (
    segments.length === 3 &&
    (segments[0] === 'items' || segments[0] === 'avatars') &&
    segments[1] === userId
  )
}
