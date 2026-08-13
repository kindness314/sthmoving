import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Pool } from 'pg'

import { withTransaction } from './pool'

export function resolveMigrationsDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env['MIGRATIONS_DIR'] ?? join(process.cwd(), 'server', 'migrations')
}

export async function migrate(
  pool: Pool,
  migrationsDirectory = resolveMigrationsDirectory(),
): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz(3) NOT NULL DEFAULT now()
     )`,
  )

  const entries = await readdir(migrationsDirectory)
  const files = entries.filter((name) => name.endsWith('.sql')).sort()
  const applied = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
  )
  const done = new Set(applied.rows.map((row) => row.name))

  const executed: string[] = []
  for (const file of files) {
    if (done.has(file)) {
      continue
    }
    const sql = await readFile(join(migrationsDirectory, file), 'utf8')
    await withTransaction(pool, async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        file,
      ])
    })
    executed.push(file)
  }
  return executed
}

export async function resetSchema(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
}
