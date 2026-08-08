import console from 'node:console'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

const rules = [
  {
    name: '微信小程序 AppID',
    pattern: /\bwx[0-9a-fA-F]{16}\b/,
  },
  {
    name: '私钥',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'GitHub 访问令牌',
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: '腾讯云 SecretId',
    pattern: /\bAKID[A-Za-z0-9]{13,}\b/,
  },
  {
    name: 'AWS Access Key ID',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    name: '疑似明文密钥字段',
    pattern:
      /["']?(?:app[_-]?secret|client[_-]?secret|access[_-]?token|api[_-]?key|password)["']?\s*[:=]\s*["'][^"' \t\r\n]{8,}["']/i,
  },
]

const excludedDirectories = new Set([
  '.git',
  '.npm-cache',
  'coverage',
  'dist',
  'miniprogram_npm',
  'node_modules',
  'ysu-net-watch-tests',
])
const excludedFiles = new Set([
  'private.config.json',
  'project.private.config.json',
])

function collectFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...collectFiles(path))
      }
      continue
    }

    if (entry.isFile() && !excludedFiles.has(entry.name)) {
      files.push(path)
    }
  }

  return files
}

const repositoryRoot = process.cwd()
const filesToScan = collectFiles(repositoryRoot)

const findings = []

for (const file of filesToScan) {
  const content = readFileSync(file)

  if (content.includes(0)) {
    continue
  }

  const lines = content.toString('utf8').split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push(
          `${relative(repositoryRoot, file)}:${index + 1} ${rule.name}`,
        )
      }
    }
  }
}

if (findings.length > 0) {
  console.error('检测到不应提交的标识或凭据：')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  console.error('请将真实值移至被 .gitignore 排除的本机私有配置或平台密钥管理。')
  process.exit(1)
}

console.log('未在待提交的仓库文件中发现已知凭据模式。')
