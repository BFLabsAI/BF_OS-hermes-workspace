/**
 * GET /api/logs-stream — SSE stream of live log entries.
 *
 * Each event: `event: log\ndata: <LogEntry JSON>\n\n`
 * Control events: `connected`, `keepalive`
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureLogStoreStarted,
  getRecentLogs,
  subscribeToLogs,
} from '../../server/log-store'

export const Route = createFileRoute('/api/logs-stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        ensureLogStoreStarted()

        const url = new URL(request.url)
        const tail = parseInt(url.searchParams.get('tail') ?? '200', 10)

        const encoder = new TextEncoder()
        let unsubscribe: (() => void) | null = null
        let keepaliveInterval: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          start(controller) {
            // Send connected + recent history
            controller.enqueue(
              encoder.encode(
                `event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`,
              ),
            )
            const history = getRecentLogs({ limit: tail })
            for (const entry of history) {
              controller.enqueue(
                encoder.encode(`event: log\ndata: ${JSON.stringify(entry)}\n\n`),
              )
            }

            // Live subscription
            unsubscribe = subscribeToLogs((entry) => {
              try {
                controller.enqueue(
                  encoder.encode(`event: log\ndata: ${JSON.stringify(entry)}\n\n`),
                )
              } catch {
                // stream closed
              }
            })

            keepaliveInterval = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(`: keepalive\n\n`))
              } catch {
                // stream closed
              }
            }, 15_000)
          },
          cancel() {
            if (unsubscribe) unsubscribe()
            if (keepaliveInterval) clearInterval(keepaliveInterval)
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
