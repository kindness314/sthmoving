import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { requireEnv } from '../config'
import { migrate } from '../db/migrate'
import { createPool } from '../db/pool'
import { checkDataset } from './check'
import type { MigrationProblem } from './dataset'
import { countDataset, readRawDataset } from './dataset'
import {
  applyFileRewrites,
  findMissingFiles,
  planFileMigration,
  registerMigratedFiles,
} from './files'
import { importDataset, verifyImport } from './import'

const usage = `用法：
  cli check <导出目录>              校验导出数据并报告问题
  cli plan-files <导出目录> <清单>  生成云存储文件搬迁清单
  cli import <导出目录>             校验通过后导入 PostgreSQL`

function reportProblems(problems: readonly MigrationProblem[]): void {
  for (const problem of problems.slice(0, 100)) {
    console.error(`${problem.collection} ${problem.id}：${problem.reason}`)
  }
  if (problems.length > 100) {
    console.error(`……另有 ${problems.length - 100} 条问题未列出`)
  }
}

async function loadChecked(directory: string) {
  const { dataset, problems } = checkDataset(await readRawDataset(directory))
  const counts = countDataset(dataset)
  for (const [collection, total] of Object.entries(counts)) {
    console.log(`${collection}\t${total}`)
  }
  return { dataset, problems }
}

async function run(argv: readonly string[]): Promise<number> {
  const [command, directory, output] = argv
  if (!command || !directory) {
    console.error(usage)
    return 1
  }

  if (command === 'check') {
    const { problems } = await loadChecked(directory)
    if (problems.length > 0) {
      reportProblems(problems)
      console.error(`共发现 ${problems.length} 条问题`)
      return 1
    }
    console.log('导出数据校验通过')
    return 0
  }

  if (command === 'plan-files') {
    if (!output) {
      console.error(usage)
      return 1
    }
    const { dataset, problems } = await loadChecked(directory)
    if (problems.length > 0) {
      reportProblems(problems)
      return 1
    }
    const plan = planFileMigration(dataset)
    await writeFile(output, JSON.stringify(plan.files, null, 2), 'utf8')
    console.log(`需要搬迁 ${plan.files.length} 个文件，清单已写入 ${output}`)
    if (plan.skipped.length > 0) {
      console.error(`${plan.skipped.length} 个文件无法生成合法路径，已跳过`)
    }
    return 0
  }

  if (command === 'import') {
    const { dataset, problems } = await loadChecked(directory)
    if (problems.length > 0) {
      reportProblems(problems)
      console.error('校验未通过，已终止导入')
      return 1
    }

    const plan = planFileMigration(dataset)
    const storageRoot = process.env['STORAGE_ROOT'] ?? 'storage'
    const missing = await findMissingFiles(storageRoot, plan.files)
    if (missing.length > 0) {
      for (const path of missing.slice(0, 20)) {
        console.error(`缺少文件 ${join(storageRoot, path)}`)
      }
      console.error(
        `${missing.length} 个文件尚未搬迁到 ${storageRoot}，已终止导入`,
      )
      return 1
    }

    const rewritten = applyFileRewrites(dataset, plan.rewrites)
    const pool = createPool({
      connectionString: requireEnv(process.env, 'DATABASE_URL'),
    })
    try {
      await migrate(pool)
      await importDataset(pool, rewritten)
      const mismatches = await verifyImport(pool, rewritten)
      if (mismatches.length > 0) {
        for (const mismatch of mismatches) {
          console.error(
            `${mismatch.collection} 数量不符：导出 ${mismatch.expected}，入库 ${mismatch.actual}`,
          )
        }
        return 1
      }
      await registerMigratedFiles(
        pool,
        storageRoot,
        plan.files,
        new Date().toISOString(),
      )
    } finally {
      await pool.end()
    }
    console.log(
      `导入完成，登记 ${plan.files.length} 个文件，重写 ${plan.rewrites.size} 个引用`,
    )
    return 0
  }

  console.error(usage)
  return 1
}

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
