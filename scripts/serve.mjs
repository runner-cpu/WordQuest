#!/usr/bin/env node
/**
 * 本地静态服务器 —— 让应用双击即用。
 *
 * 为什么不用 file:// 直接打开 dist/index.html：
 * 浏览器会以不透明来源（opaque origin）加载 file:// 页面，IndexedDB 与
 * Service Worker 都会被拒绝，学习记录无法保存。必须走 http://localhost。
 *
 * 功能：
 * - 服务 dist/ 目录，正确的 MIME 类型
 * - Service Worker 与 index.html 不缓存，保证更新能生效
 * - 端口被占用时自动向后找一个空闲端口
 * - 同时监听 0.0.0.0，打印局域网地址，手机可直接访问
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')
const START_PORT = Number(process.env.PORT) || 4173
const MAX_TRIES = 30

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** 不应被缓存的文件：更新必须立刻生效 */
const NO_CACHE = new Set(['/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest'])

function isInsideDist(target) {
  const rel = path.relative(DIST, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function serveFile(res, filePath, urlPath) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] ?? 'application/octet-stream'
  const headers = {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
  }
  if (NO_CACHE.has(urlPath) || urlPath.endsWith('sw.js')) {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
  } else if (urlPath.startsWith('/assets/') || urlPath.startsWith('/data/') || urlPath.startsWith('/icons/')) {
    // 构建产物文件名带 hash，可长期缓存；词库分片同理
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  } else {
    headers['Cache-Control'] = 'no-cache'
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('读取文件失败：' + err.message)
      return
    }
    headers['Content-Length'] = buf.length
    res.writeHead(200, headers)
    res.end(buf)
  })
}

const server = http.createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end('Bad request')
    return
  }

  // 根路径 → index.html
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  let filePath = path.join(DIST, rel)

  if (!isInsideDist(filePath)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      serveFile(res, filePath, urlPath)
      return
    }
    // 目录 → 其下的 index.html
    if (!err && stat.isDirectory()) {
      const idx = path.join(filePath, 'index.html')
      if (fs.existsSync(idx)) {
        serveFile(res, idx, urlPath)
        return
      }
    }
    // SPA 回退：无扩展名的路径交给前端路由
    if (!path.extname(urlPath)) {
      const idx = path.join(DIST, 'index.html')
      if (fs.existsSync(idx)) {
        serveFile(res, idx, '/index.html')
        return
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 未找到：' + urlPath)
  })
})

function lanAddresses() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address)
    }
  }
  return out
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  execFile(cmd[0], cmd[1], () => {})
}

function tryListen(port, attempt = 0) {
  if (attempt > MAX_TRIES) {
    console.error(`端口 ${START_PORT}-${START_PORT + MAX_TRIES} 都被占用，请关闭占用程序后重试。`)
    process.exit(1)
  }
  const onError = (err) => {
    if (err.code === 'EADDRINUSE') {
      server.removeListener('listening', onListening)
      tryListen(port + 1, attempt + 1)
    } else {
      console.error('启动失败：', err.message)
      process.exit(1)
    }
  }
  const onListening = () => {
    server.removeListener('error', onError)
    const local = `http://localhost:${port}`
    console.log('')
    console.log('  单词勇者 WordQuest 已启动')
    console.log('')
    console.log(`  本机访问   ${local}`)
    for (const ip of lanAddresses()) {
      console.log(`  手机访问   http://${ip}:${port}`)
    }
    console.log('')
    console.log('  关闭此窗口即停止服务。学习数据保存在浏览器本地。')
    console.log('')
    if (process.env.NO_OPEN !== '1') openBrowser(local)
  }
  server.once('error', onError)
  server.once('listening', onListening)
  server.listen(port, '0.0.0.0')
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('还没有构建产物。请先运行：npm run build')
  process.exit(1)
}

tryListen(START_PORT)
