#!/usr/bin/env node
// 填充审核沙箱的演示数据（只作用于沙箱数据域，生产数据不受影响）。
//
// 用法：
//   node scripts/seed-sandbox-demo.mjs --base https://<域名> --password <测试口令>
//   node scripts/seed-sandbox-demo.mjs --base https://<域名> --token <沙箱会话令牌>
//
// 数据经真实接口写入，因此会生成物品编码、操作日志与文件登记，与人工操作完全一致。
// 重复执行会拒绝（避免堆重复数据）；需要重来时先按 docs/审核测试环境.md 清空沙箱。

import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { deflateSync } from 'node:zlib'

const paletteList = [
  { top: [23, 54, 93], bottom: [232, 238, 246], accent: [15, 118, 110] },
  { top: [159, 18, 57], bottom: [252, 232, 236], accent: [180, 83, 9] },
  { top: [124, 58, 237], bottom: [241, 235, 254], accent: [3, 105, 161] },
  { top: [6, 95, 70], bottom: [230, 245, 238], accent: [180, 83, 9] },
  { top: [180, 83, 9], bottom: [253, 240, 226], accent: [23, 54, 93] },
  { top: [51, 65, 85], bottom: [236, 240, 245], accent: [15, 118, 110] },
]

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 3))
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixelAt(x, y)
      raw[offset] = red
      raw[offset + 1] = green
      raw[offset + 2] = blue
      offset += 3
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 生成一张可辨识的示意图：上下分区 + 一个色块圆。 */
function demoImage(seed) {
  const width = 480
  const height = 360
  const palette = paletteList[seed % paletteList.length]
  const centerX = 110 + ((seed * 67) % 260)
  const centerY = 120 + ((seed * 53) % 120)
  return encodePng(width, height, (x, y) => {
    const inCircle = (x - centerX) ** 2 + (y - centerY) ** 2 < 72 ** 2
    if (inCircle) {
      return palette.accent
    }
    return y < height / 2 ? palette.top : palette.bottom
  })
}

const itemSeeds = [
  { name: '折叠桌', quantity: 2, office: '503', category: '活动器材', image: true, description: '两张长桌，503 器材间靠墙叠放' },
  { name: '折叠椅', quantity: 20, office: '102', category: '活动器材', image: true, description: '蓝色软座，成捆收纳' },
  { name: '无线麦克风', quantity: 4, office: '503', category: '舞台设备', image: true, description: '含接收器两个，电池已取出' },
  { name: '便携投影仪', quantity: 1, office: '103', category: '办公用品', image: true, description: '含电源与 HDMI 线' },
  { name: '铝合金桁架', quantity: 6, office: '503', category: '舞台设备', image: false, description: '单根 2 米，配快锁' },
  { name: '背景喷绘布', quantity: 3, office: '102', category: '宣传物料', image: false, description: '3×2 米，卷筒存放' },
  { name: '对讲机', quantity: 8, office: '503', category: '办公用品', image: true, description: '含充电座，频道已统一' },
  { name: '讲台', quantity: 1, office: '102', category: '活动器材', image: false, description: '木质，带亚克力名牌槽' },
  { name: '易拉宝', quantity: 4, office: '103', category: '宣传物料', image: false, description: '含三种画面，可更换' },
]

function parseArguments(argv) {
  const options = { base: '', password: '', token: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    const value = argv[index + 1]
    if (key === '--base' && value) options.base = value
    if (key === '--password' && value) options.password = value
    if (key === '--token' && value) options.token = value
  }
  if (!options.base) {
    throw new Error('缺少 --base（服务端地址）')
  }
  if (!options.password && !options.token) {
    throw new Error('缺少 --password（测试口令）或 --token（沙箱会话令牌）')
  }
  return options
}

async function loginWithPassword(base, password) {
  const response = await globalThis.fetch(`${base}/auth/test-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const body = await response.json()
  if (!body.ok) {
    throw new Error(`测试口令登录失败 ${body.error.code}: ${body.error.message}`)
  }
  return body.data.token
}

async function callApi(base, token, module, action, payload) {
  const response = await globalThis.fetch(`${base}/api`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ module, action, payload }),
  })
  const body = await response.json()
  if (!body.ok) {
    throw new Error(`${module}.${action} 失败 ${body.error.code}: ${body.error.message}`)
  }
  return body.data
}

async function uploadImage(base, token, bytes) {
  const ticket = await globalThis.fetch(`${base}/files/uploads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ purpose: 'ITEM_IMAGE', contentType: 'image/png' }),
  })
  const body = await ticket.json()
  if (!body.ok) {
    throw new Error(`申请上传失败 ${body.error.code}: ${body.error.message}`)
  }
  const uploaded = await globalThis.fetch(body.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: bytes,
  })
  if (!uploaded.ok) {
    throw new Error(`上传文件失败 HTTP ${uploaded.status}`)
  }
  return body.data.reference
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const base = options.base.replace(/\/+$/, '')
  const token = options.token || (await loginWithPassword(base, options.password))

  const existing = await callApi(base, token, 'items', 'list', {})
  if (Array.isArray(existing.items) && existing.items.length > 0) {
    throw new Error(
      `沙箱已有 ${existing.items.length} 件物品；请先清空沙箱再填充（见 docs/审核测试环境.md）`,
    )
  }

  const categoryIds = new Map()
  for (const name of ['活动器材', '办公用品', '舞台设备', '宣传物料']) {
    const category = await callApi(base, token, 'categories', 'create', { name })
    categoryIds.set(name, category.id)
    console.log(`分类 ${name}`)
  }

  const createdItems = []
  for (const [index, seed] of itemSeeds.entries()) {
    const images = seed.image
      ? [await uploadImage(base, token, demoImage(index))]
      : []
    const item = await callApi(base, token, 'items', 'create', {
      name: seed.name,
      images,
      description: seed.description,
      quantityMode: seed.quantity > 1 ? 'MULTIPLE' : 'SINGLE',
      quantity: seed.quantity,
      categoryId: categoryIds.get(seed.category),
      office: seed.office,
      commitSummary: '演示数据初始化',
    })
    createdItems.push(item)
    console.log(`物品 ${item.code} ${seed.name}（×${seed.quantity}，图片 ${images.length}）`)
  }

  const pendingTarget = createdItems[4]
  await callApi(base, token, 'outbound', 'create', {
    itemId: pendingTarget.id,
    reason: '下周场地布置需要，预计周五归还',
  })
  console.log(`待审批离库申请：${pendingTarget.name}`)

  const offShelfTarget = createdItems[8]
  await callApi(base, token, 'outbound', 'direct', { itemId: offShelfTarget.id })
  console.log(`已直接离库：${offShelfTarget.name}`)

  console.log(
    `\n完成：${categoryIds.size} 个分类、${createdItems.length} 件物品（含 ` +
      `${itemSeeds.filter((seed) => seed.image).length} 张图片）、1 条待审批离库申请、1 件已离库物品`,
  )
}

await main()
