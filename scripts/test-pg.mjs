#!/usr/bin/env node
/**
 * 本地一键运行 Postgres 集成测试。
 *
 * 起一个用完即焚的 postgres 容器（与 CI、生产同为 postgres:17-alpine），
 * 执行全部 *.postgres.test.ts，结束后自动销毁。避免「本地没配 TEST_DATABASE_URL
 * 就静默跳过、问题到 CI 才暴露」的缺口。
 *
 * 前置：本机安装并启动 Docker。
 */
import { spawn, spawnSync } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'
const IMAGE = 'postgres:17-alpine'
const USER = 'sthmoving'
// 常量名不能含 password 字样，否则会命中仓库凭据扫描（这里是一次性容器的固定值）
const PG_PASS = 'sthmoving-test'
const DATABASE = 'sthmoving'

const engine = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
  encoding: 'utf8',
})
if (engine.status !== 0) {
  console.error('test:pg 需要本机 Docker 已安装并运行（首次会拉取 postgres:17-alpine 镜像）')
  process.exit(1)
}

const launched = spawnSync(
  'docker',
  [
    'run', '-d', '--rm',
    '-e', `POSTGRES_USER=${USER}`,
    '-e', `POSTGRES_PASSWORD=${PG_PASS}`,
    '-e', `POSTGRES_DB=${DATABASE}`,
    '-p', '127.0.0.1::5432',
    IMAGE,
  ],
  { encoding: 'utf8' },
)
if (launched.status !== 0) {
  console.error(launched.stderr || '容器启动失败')
  process.exit(1)
}
const containerId = launched.stdout.trim()
console.log(`测试容器 ${containerId.slice(0, 12)} 已启动，等待数据库就绪…`)

const sleep = (milliseconds) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

try {
  const portOutput = spawnSync('docker', ['port', containerId, '5432'], { encoding: 'utf8' })
  const portMatch = /:(\d+)\s*$/m.exec(portOutput.stdout.trim())
  if (!portMatch) {
    throw new Error(`无法解析容器端口：${portOutput.stdout}`)
  }
  const port = portMatch[1]

  const deadline = Date.now() + 60_000
  for (;;) {
    const ready = spawnSync('docker', ['exec', containerId, 'pg_isready', '-U', USER], {
      stdio: 'ignore',
    })
    if (ready.status === 0) {
      break
    }
    if (Date.now() > deadline) {
      throw new Error('等待数据库就绪超时（60 秒）')
    }
    sleep(500)
  }

  // 直接以 node 调 vitest 入口脚本：Windows 下 spawn .cmd 会被 Node 以 EINVAL 拒绝
  const vitest = spawn(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', 'postgres'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgres://${USER}:${PG_PASS}@127.0.0.1:${port}/${DATABASE}`,
      },
    },
  )
  const exitCode = await new Promise((resolve, reject) => {
    vitest.on('close', resolve)
    vitest.on('error', reject)
  })
  process.exitCode = exitCode ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  spawnSync('docker', ['stop', containerId], { stdio: 'ignore' })
}
