export type MiniProgramEnvironment = 'develop' | 'trial' | 'release'

export const miniProgramEnvironments: readonly MiniProgramEnvironment[] = [
  'develop',
  'trial',
  'release',
]

export function readMiniProgramEnvironment(
  value: string | undefined,
  fallback: MiniProgramEnvironment,
): MiniProgramEnvironment {
  return miniProgramEnvironments.includes(value as MiniProgramEnvironment)
    ? (value as MiniProgramEnvironment)
    : fallback
}
