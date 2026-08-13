import type { Pool } from 'pg'

import type { FilePurpose } from './storage'

export interface FileRecord {
  readonly path: string
  readonly purpose: FilePurpose
  readonly ownerId: string | null
  readonly contentType: string
  readonly sizeBytes: number
  readonly createdAt: string
}

export interface FileRegistry {
  record(file: FileRecord): Promise<void>
  get(path: string): Promise<FileRecord | null>
  remove(paths: readonly string[]): Promise<void>
}

interface FileRow {
  path: string
  purpose: FilePurpose
  owner_id: string | null
  content_type: string
  size_bytes: number
  created_at: Date | string
}

function toRecord(row: FileRow): FileRecord {
  return {
    path: row.path,
    purpose: row.purpose,
    ownerId: row.owner_id,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  }
}

export class PostgresFileRegistry implements FileRegistry {
  constructor(private readonly pool: Pool) {}

  async record(file: FileRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO files
         (path, purpose, owner_id, content_type, size_bytes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (path) DO UPDATE SET
         purpose = EXCLUDED.purpose,
         owner_id = EXCLUDED.owner_id,
         content_type = EXCLUDED.content_type,
         size_bytes = EXCLUDED.size_bytes,
         created_at = EXCLUDED.created_at`,
      [
        file.path,
        file.purpose,
        file.ownerId,
        file.contentType,
        file.sizeBytes,
        file.createdAt,
      ],
    )
  }

  async get(path: string): Promise<FileRecord | null> {
    const result = await this.pool.query<FileRow>(
      'SELECT * FROM files WHERE path = $1',
      [path],
    )
    const row = result.rows[0]
    return row ? toRecord(row) : null
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return
    }
    await this.pool.query('DELETE FROM files WHERE path = ANY($1::text[])', [
      [...paths],
    ])
  }
}
