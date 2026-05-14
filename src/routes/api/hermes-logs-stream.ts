/**
 * GET /api/hermes-logs-stream — SSE live tail of ~/.hermes/logs/*.log
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureHermesLogTailerStarted,
  getRecentHermesLogs,
  subscribeToHermesLogs,
} from '../../server/hermes-log-tailer'

export const Route = createFileRoute('/api/hermes-logs-stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        await ensureHermesLogTailerStarted()

        const url = new URL(request.url)
        const tail = parseInt(url.searchParams.get('tail') ?? '300', 10)

        const encoder = new TextEncoder()
        let unsubscribe: (() => void) | null = null
        let keepaliveInterval: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`),
            )
            const history = getRecentHermesLogs({ limit: tail })
            for (const entry of history) {
              controller.enqueue(
                encoder.encode(`event: log\ndata: ${JSON.stringify(entry)}\n\n`),
              )
            }
            unsubscribe = subscribeToHermesLogs((entry) => {
              try {
                controller.enqueue(
                  encoder.encode(`event: log\ndata: ${JSON.stringify(entry)}\n\n`),
                )
              } catch { /* closed */ }
            })
            keepaliveInterval = setInterval(() => {
              try { controller.enqueue(encoder.encode(`: keepalive\n\n`)) } catch { /* closed */ }
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
