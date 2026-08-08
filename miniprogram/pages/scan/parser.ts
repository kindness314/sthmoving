export function parseScanTarget(
  result: Record<string, unknown>,
): string | null {
  const path = typeof result.path === 'string' ? result.path : ''
  const rawData = typeof result.rawData === 'string' ? result.rawData : ''
  const rawResult = typeof result.result === 'string' ? result.result : ''
  const candidates = [path, rawData, rawResult]
  for (const value of candidates) {
    const scene = extractScene(value)
    if (scene) {
      return `/pages/item-detail/index?scene=${encodeURIComponent(scene)}`
    }
    const decodedValue = decodeScanValue(value)
    const normalizedPath = decodedValue.replace(/^\/+/, '')
    if (/^pages\/item-detail\/index(?:\?|$)/.test(normalizedPath)) {
      return `/${normalizedPath}`
    }
  }
  return null
}

export function extractScene(value: string): string | null {
  const trimmed = decodeScanValue(value)
  const directScene = normalizeScene(trimmed)
  if (directScene) {
    return directScene
  }
  if (/^[A-Fa-f0-9]{12}$/.test(trimmed)) {
    return `i=${trimmed.toUpperCase()}`
  }
  const match = /(?:[?&]|^)scene=([^&#]+)/.exec(trimmed)
  if (!match?.[1]) {
    return null
  }
  const scene = decodeScanValue(match[1])
  return normalizeScene(scene)
}

function normalizeScene(value: string): string | null {
  return /^i=[A-Fa-f0-9]{12}$/i.test(value)
    ? `i=${value.slice(2).toUpperCase()}`
    : null
}

function decodeScanValue(value: string): string {
  let decoded = value.trim()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) {
        break
      }
      decoded = next
    } catch {
      break
    }
  }
  return decoded
}
