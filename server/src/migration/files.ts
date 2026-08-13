import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { Pool } from 'pg'

import {
  parseSelfHostedPath,
  toSelfHostedReference,
} from '../../../cloudfunctions/api/src/storage/file-reference'
import { PostgresFileRegistry } from '../storage/files'
import type { FilePurpose } from '../storage/storage'
import type { MigrationDataset } from './dataset'

export interface PlannedFile {
  readonly cloudFileId: string
  readonly path: string
  readonly purpose: FilePurpose
  readonly ownerId: string | null
}

export interface FileMigrationPlan {
  readonly files: readonly PlannedFile[]
  readonly rewrites: ReadonlyMap<string, string>
  readonly skipped: readonly string[]
}

const extensions = new Set(['jpg', 'jpeg', 'png', 'webp'])

export function digestOf(cloudFileId: string): string {
  return createHash('sha256').update(cloudFileId).digest('hex').slice(0, 32)
}

export function extensionOf(cloudFileId: string): string {
  const extension = /\.([a-zA-Z0-9]+)$/u.exec(cloudFileId)?.[1]?.toLowerCase()
  return extension && extensions.has(extension) ? extension : 'jpg'
}

export function planFileMigration(
  dataset: MigrationDataset,
): FileMigrationPlan {
  const files = new Map<string, PlannedFile>()
  const skipped: string[] = []

  const plan = (
    cloudFileId: string,
    path: string,
    purpose: FilePurpose,
    ownerId: string | null,
  ) => {
    if (files.has(cloudFileId)) {
      return
    }
    if (parseSelfHostedPath(toSelfHostedReference(path)) === null) {
      skipped.push(cloudFileId)
      return
    }
    files.set(cloudFileId, { cloudFileId, path, purpose, ownerId })
  }

  for (const user of dataset.users) {
    const avatar = user.avatar_url
    if (avatar?.startsWith('cloud://')) {
      plan(
        avatar,
        `avatars/${user._id}/${digestOf(avatar)}.${extensionOf(avatar)}`,
        'AVATAR',
        user._id,
      )
    }
  }

  for (const item of dataset.items) {
    for (const image of item.images) {
      if (image.startsWith('cloud://')) {
        plan(
          image,
          `items/${item.registered_by}/${digestOf(image)}.${extensionOf(image)}`,
          'ITEM_IMAGE',
          item.registered_by,
        )
      }
    }
  }

  for (const label of dataset.item_labels) {
    const fileId = label.file_id
    if (fileId?.startsWith('cloud://')) {
      plan(
        fileId,
        `labels/${label.item_id}/${label.public_code}.png`,
        'LABEL',
        null,
      )
    }
  }

  return {
    files: [...files.values()],
    rewrites: new Map(
      [...files.values()].map((file) => [
        file.cloudFileId,
        toSelfHostedReference(file.path),
      ]),
    ),
    skipped,
  }
}

const contentTypes: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function contentTypeOf(path: string): string {
  const extension = /\.([a-zA-Z0-9]+)$/u.exec(path)?.[1]?.toLowerCase()
  return (extension && contentTypes[extension]) || 'image/jpeg'
}

export async function findMissingFiles(
  storageRoot: string,
  files: readonly PlannedFile[],
): Promise<string[]> {
  const missing: string[] = []
  for (const file of files) {
    try {
      const info = await stat(join(storageRoot, file.path))
      if (!info.isFile() || info.size === 0) {
        missing.push(file.path)
      }
    } catch {
      missing.push(file.path)
    }
  }
  return missing
}

export async function registerMigratedFiles(
  pool: Pool,
  storageRoot: string,
  files: readonly PlannedFile[],
  createdAt: string,
): Promise<number> {
  const registry = new PostgresFileRegistry(pool)
  for (const file of files) {
    const info = await stat(join(storageRoot, file.path))
    await registry.record({
      path: file.path,
      purpose: file.purpose,
      ownerId: file.ownerId,
      contentType: contentTypeOf(file.path),
      sizeBytes: info.size,
      createdAt,
    })
  }
  return files.length
}

export function applyFileRewrites(
  dataset: MigrationDataset,
  rewrites: ReadonlyMap<string, string>,
): MigrationDataset {
  const rewrite = (fileId: string) => rewrites.get(fileId) ?? fileId
  return {
    ...dataset,
    users: dataset.users.map((user) =>
      user.avatar_url
        ? { ...user, avatar_url: rewrite(user.avatar_url) }
        : user,
    ),
    items: dataset.items.map((item) => ({
      ...item,
      images: item.images.map(rewrite),
    })),
    item_labels: dataset.item_labels.map((label) =>
      label.file_id ? { ...label, file_id: rewrite(label.file_id) } : label,
    ),
  }
}
