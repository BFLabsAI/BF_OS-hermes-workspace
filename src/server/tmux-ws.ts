/**
 * WebSocket layer for tmux multiplexer.
 *
 * Single endpoint `/api/tmux/ws` — multiplexes input/output/resize for any
 * number of panes over one connection per browser tab.
 *
 * Protocol (JSON text frames):
 *
 *   Client → server:
 *     { type: 'subscribe', paneId: string }
 *     { type: 'unsubscribe', paneId: string }
 *     { type: 'input', paneId: string, data: string }
 *     { type: 'resize', paneId: string, cols: number, rows: number }
 *
 *   Server → client:
 *     { type: 'output', paneId: string, data: string }
 *     { type: 'exit', paneId: string }
 *     { type: 'error', message: string }
 */
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { createRequire } from 'node:module'
// `ws` uses `module.exports = WebSocket` (CJS) with `.WebSocketServer` as a
// static. ESM default-import via tsx loader strips static members, so we MUST
// go through createRequire here. DO NOT replace with `import 'ws'` (runtime
// breaks with "Invalid URL" when WebSocketServer ends up as the client class)
// and DO NOT replace with bare `require('ws')` either — this file runs in
// ESM scope, where `require` is not defined.
const requireCjs = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsAny = any
const { WebSocketServer } = requireCjs('ws') as {
  WebSocketServer: new (opts: WsAny) => WsAny
}
import {
  resizePane,
  sendInput,
  subscribePane,
} from './tmux-sessions'
import {
  getSessionTokenFromCookie,
  isValidSessionToken,
  isPasswordProtectionEnabled,
} from './auth-middleware'

const WS_PATH = '/api/tmux/ws'

type ClientMessage =
  | { type: 'subscribe'; paneId: string }
  | { type: 'unsubscribe'; paneId: string }
  | { type: 'input'; paneId: string; data: string }
  | { type: 'resize'; paneId: string; cols: number; rows: number }

function checkAuth(req: IncomingMessage): boolean {
  if (!isPasswordProtectionEnabled()) return true
  const cookie = req.headers.cookie ?? ''
  const token = getSessionTokenFromCookie(cookie)
  if (!token) return false
  return isValidSessionToken(token)
}

export function attachTmuxWebSocket(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== WS_PATH) return // not for us; let others handle

    if (!checkAuth(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws: WsAny) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws: WsAny) => {
    const unsubscribes = new Map<string, () => void>()

    const send = (msg: unknown) => {
      try {
        ws.send(JSON.stringify(msg))
      } catch {
        /* */
      }
    }

    ws.on('message', (raw: Buffer) => {
      let msg: ClientMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        send({ type: 'error', message: 'invalid json' })
        return
      }

      switch (msg.type) {
        case 'subscribe': {
          if (unsubscribes.has(msg.paneId)) return
          const off = subscribePane(
            msg.paneId,
            (data) => send({ type: 'output', paneId: msg.paneId, data }),
            () => send({ type: 'exit', paneId: msg.paneId }),
          )
          unsubscribes.set(msg.paneId, off)
          break
        }
        case 'unsubscribe': {
          unsubscribes.get(msg.paneId)?.()
          unsubscribes.delete(msg.paneId)
          break
        }
        case 'input': {
          sendInput(msg.paneId, msg.data)
          break
        }
        case 'resize': {
          resizePane(msg.paneId, msg.cols, msg.rows)
          break
        }
      }
    })

    ws.on('close', () => {
      for (const off of unsubscribes.values()) off()
      unsubscribes.clear()
    })
  })

  console.log(`[tmux-ws] WebSocket attached at ${WS_PATH}`)
}
