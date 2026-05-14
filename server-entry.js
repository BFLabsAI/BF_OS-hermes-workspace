import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'
import server from './dist/server/server.js'

// Register tsx ESM loader so we can import TypeScript modules directly
// (used for the tmux WebSocket server, which needs to attach to httpServer
// outside the TanStack Start request lifecycle).
try {
  register('tsx/esm', pathToFileURL('./'))
} catch (err) {
  console.warn('[server-entry] tsx loader registration failed:', err?.message ?? err)
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CLIENT_DIR = join(__dirname, 'dist', 'client')

const port = parseInt(process.env.PORT || '3000', 10)
// Default HOST to localhost-only. Operators who want the workspace reachable
// on a LAN / Tailscale / public surface must opt in explicitly with
// HOST=0.0.0.0 *and* set HERMES_PASSWORD (enforced below). See #122.
const host = process.env.HOST || '127.0.0.1'

function isNonLoopbackHost(h) {
  if (!h) return false
  const norm = h.trim().toLowerCase()
  if (norm === '127.0.0.1' || norm === '::1' || norm === 'localhost') {
    return false
  }
  return true
}

if (isNonLoopbackHost(host)) {
  const password = (process.env.HERMES_PASSWORD || '').trim()
  if (!password) {
    console.error(
      '\n[workspace] refusing to start.\n' +
        `  HOST is set to "${host}" (non-loopback), but HERMES_PASSWORD is unset.\n` +
        '  This would expose a high-privilege control plane (terminals, files, agents)\n' +
        '  to anyone who can reach the port. Either:\n' +
        '    • set HOST=127.0.0.1 for local-only access, or\n' +
        '    • set HERMES_PASSWORD=<strong-secret> to enable workspace auth, or\n' +
        '    • set HERMES_ALLOW_INSECURE_REMOTE=1 to bypass this check (not recommended).\n' +
        '  See #122 for context.\n',
    )
    const allowInsecure = (process.env.HERMES_ALLOW_INSECURE_REMOTE || '')
      .trim()
      .toLowerCase()
    if (allowInsecure !== '1' && allowInsecure !== 'true' && allowInsecure !== 'yes') {
      process.exit(1)
    }
    console.warn(
      '[workspace] HERMES_ALLOW_INSECURE_REMOTE is set — starting anyway.',
    )
  }
}

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

async function tryServeStatic(req, res) {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )
  const pathname = decodeURIComponent(url.pathname)

  // Prevent directory traversal
  if (pathname.includes('..')) return false

  const filePath = join(CLIENT_DIR, pathname)

  // Make sure the resolved path is within CLIENT_DIR
  if (!filePath.startsWith(CLIENT_DIR)) return false

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return false

    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const data = await readFile(filePath)

    const headers = {
      'Content-Type': contentType,
      'Content-Length': data.length,
    }

    // Cache hashed assets aggressively (they have content hashes in filenames)
    if (pathname.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    }

    res.writeHead(200, headers)
    res.end(data)
    return true
  } catch {
    return false
  }
}

// Paths that are too noisy to log individually
const SILENT_PREFIXES = ['/assets/', '/api/logs-stream', '/api/kanban-events', '/api/chat-events']

const httpServer = createServer(async (req, res) => {
  const t0 = Date.now()
  const method = req.method || 'GET'
  const url = req.url || '/'

  // Try static files first (client assets)
  if (method === 'GET' || method === 'HEAD') {
    const served = await tryServeStatic(req, res)
    if (served) return
  }

  // Hook response finish to log the completed request
  const silent = SILENT_PREFIXES.some((p) => url.startsWith(p))
  if (!silent) {
    res.on('finish', () => {
      const ms = Date.now() - t0
      console.log(`[http] ${method} ${url} → ${res.statusCode} (${ms}ms)`)
    })
  }

  // Fall through to SSR handler
  const parsedUrl = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  let body = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  const request = new Request(parsedUrl.toString(), {
    method: req.method,
    headers,
    body,
    duplex: 'half',
  })

  try {
    const response = await server.fetch(request)

    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    )

    if (response.body) {
      const reader = response.body.getReader()
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      }
      pump().catch((err) => {
        console.error('Stream error:', err)
        res.end()
      })
    } else {
      const text = await response.text()
      res.end(text)
    }
  } catch (err) {
    console.error('Request error:', err)
    res.writeHead(500)
    res.end('Internal Server Error')
  }
})

httpServer.listen(port, host, async () => {
  console.log(`Hermes Workspace running at http://${host}:${port}`)
  // Attach tmux WebSocket multiplexer (path: /api/tmux/ws)
  try {
    const { attachTmuxWebSocket } = await import('./src/server/tmux-ws.ts')
    attachTmuxWebSocket(httpServer)
  } catch (err) {
    console.error('[tmux-ws] failed to attach:', err)
  }
})
