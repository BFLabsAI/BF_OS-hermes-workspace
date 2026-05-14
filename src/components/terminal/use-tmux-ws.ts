/**
 * Single WebSocket multiplexed across all panes in the terminal panel.
 *
 * Usage:
 *   const ws = useTmuxWs()
 *   ws.subscribe(paneId, onOutput, onExit)
 *   ws.sendInput(paneId, data)
 *   ws.sendResize(paneId, cols, rows)
 *   ws.unsubscribe(paneId)
 */
import { useEffect, useMemo, useRef } from 'react'

type Subscriber = {
  onOutput: (data: string) => void
  onExit?: () => void
}

type ServerMessage =
  | { type: 'output'; paneId: string; data: string }
  | { type: 'exit'; paneId: string }
  | { type: 'error'; message: string }

export type TmuxWsHandle = {
  subscribe: (
    paneId: string,
    onOutput: (data: string) => void,
    onExit?: () => void,
  ) => void
  unsubscribe: (paneId: string) => void
  sendInput: (paneId: string, data: string) => void
  sendResize: (paneId: string, cols: number, rows: number) => void
  isOpen: () => boolean
}

function buildWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/tmux/ws`
}

export function useTmuxWs(): TmuxWsHandle {
  const wsRef = useRef<WebSocket | null>(null)
  const subscribersRef = useRef(new Map<string, Subscriber>())
  const queueRef = useRef<Array<string>>([])
  const openRef = useRef(false)
  // Track subscriptions we need to re-send after reconnect.
  const subscribedPaneIdsRef = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    let reconnectTimer: number | undefined

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket(buildWsUrl())
      wsRef.current = ws

      ws.addEventListener('open', () => {
        openRef.current = true
        // Flush queued messages
        for (const msg of queueRef.current) ws.send(msg)
        queueRef.current = []
        // Re-subscribe to all known panes (after reconnect)
        for (const paneId of subscribedPaneIdsRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', paneId }))
        }
      })

      ws.addEventListener('message', (event) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(event.data) as ServerMessage
        } catch {
          return
        }
        if (msg.type === 'output') {
          subscribersRef.current.get(msg.paneId)?.onOutput(msg.data)
        } else if (msg.type === 'exit') {
          subscribersRef.current.get(msg.paneId)?.onExit?.()
        }
      })

      ws.addEventListener('close', () => {
        openRef.current = false
        wsRef.current = null
        if (cancelled) return
        // Auto-reconnect after 1s
        reconnectTimer = window.setTimeout(connect, 1000)
      })

      ws.addEventListener('error', () => {
        // close handler will fire and reconnect; nothing else here
      })
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      wsRef.current?.close()
      wsRef.current = null
      openRef.current = false
    }
  }, [])

  const handle = useMemo<TmuxWsHandle>(() => {
    const send = (msg: unknown) => {
      const text = JSON.stringify(msg)
      const ws = wsRef.current
      if (ws && openRef.current && ws.readyState === WebSocket.OPEN) {
        ws.send(text)
      } else {
        queueRef.current.push(text)
      }
    }

    return {
      subscribe(paneId, onOutput, onExit) {
        subscribersRef.current.set(paneId, { onOutput, onExit })
        subscribedPaneIdsRef.current.add(paneId)
        send({ type: 'subscribe', paneId })
      },
      unsubscribe(paneId) {
        subscribersRef.current.delete(paneId)
        subscribedPaneIdsRef.current.delete(paneId)
        send({ type: 'unsubscribe', paneId })
      },
      sendInput(paneId, data) {
        send({ type: 'input', paneId, data })
      },
      sendResize(paneId, cols, rows) {
        send({ type: 'resize', paneId, cols, rows })
      },
      isOpen() {
        return openRef.current
      },
    }
  }, [])

  return handle
}
