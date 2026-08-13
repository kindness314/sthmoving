import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import type { FileStorage } from './storage'

export class LocalFileStorage implements FileStorage {
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async write(path: string, content: Buffer): Promise<void> {
    const target = this.resolveWithin(path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  async read(path: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveWithin(path))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async delete(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      await rm(this.resolveWithin(path), { force: true })
    }
  }

  private resolveWithin(path: string): string {
    const target = resolve(join(this.root, path))
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error('文件路径越出存储根目录')
    }
    return target
  }
}
