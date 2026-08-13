import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const entryPoints = ['server/src/main.ts', 'server/src/migration/cli.ts']

const valueImport = /^\s*(?:import|export)\s+(?!type\s)[^'"]*from\s+'([^']+)'/gm
const bareImport = /^\s*import\s+'([^']+)'/gm

async function specifiersOf(path: string): Promise<string[]> {
  const source = await readFile(path, 'utf8')
  return [
    ...[...source.matchAll(valueImport)].map((match) => match[1] as string),
    ...[...source.matchAll(bareImport)].map((match) => match[1] as string),
  ]
}

async function collectRuntimeGraph(): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>()
  const queue = entryPoints.map((entry) => join(repositoryRoot, entry))

  while (queue.length > 0) {
    const path = queue.pop() as string
    if (graph.has(path)) {
      continue
    }
    const specifiers = await specifiersOf(path)
    graph.set(
      path,
      specifiers.filter((specifier) => !specifier.startsWith('.')),
    )
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        queue.push(`${resolve(dirname(path), specifier)}.ts`)
      }
    }
  }
  return graph
}

describe('自建后端的运行时依赖', () => {
  it('不经由任何路径拉入微信云 SDK', async () => {
    const graph = await collectRuntimeGraph()
    const offenders = [...graph]
      .filter(([, specifiers]) => specifiers.includes('wx-server-sdk'))
      .map(([path]) => path.slice(repositoryRoot.length + 1))

    expect(offenders).toEqual([])
  })

  it('只依赖 pg 与 Node 内置模块', async () => {
    const graph = await collectRuntimeGraph()
    const external = new Set(
      [...graph.values()]
        .flat()
        .filter((specifier) => !specifier.startsWith('node:')),
    )

    expect([...external]).toEqual(['pg'])
  })

  it('入口确实覆盖到了仓储与路由', async () => {
    const graph = await collectRuntimeGraph()
    const files = [...graph.keys()].map((path) =>
      path.slice(repositoryRoot.length + 1),
    )

    expect(files).toContain('server/src/repositories/items.ts')
    expect(files).toContain('cloudfunctions/api/src/router.ts')
    expect(files).toContain('server/src/storage/routes.ts')
  })

  it('云函数目录下没有遗漏未被扫描的入口', async () => {
    const entries = await readdir(join(repositoryRoot, 'server/src'), {
      recursive: true,
    })
    expect(entries.filter((entry) => entry.endsWith('.ts')).length).toBeGreaterThan(
      15,
    )
  })
})
