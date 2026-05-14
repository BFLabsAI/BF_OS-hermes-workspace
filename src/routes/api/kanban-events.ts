/**
 * GET /api/kanban-events — SSE stream of canonical kanban events,
 * proxied from the dashboard plugin's WebSocket feed.
 *
 * Browser clients open an EventSource here. Each event arrives as:
 *   event: <kind>
 *   data: {id, task_id, run_id, kind, payload, created_at}
 *
 * Special control events: `connected`, `disconnected`, `keepalive`.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureKanbanBusStarted,
  subscribeToKanbanEvents,
} from '../../server/kanban-event-bus'

export const Route = createFileRoute('/api/kanban-events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }

        const url = new URL(request.url)
        const board = url.searchParams.get('board') || undefined

        await ensureKanbanBusStarted({ board })

        const encoder = new TextEncoder()
        let unsubscribe: (() => void) | null = null
        let keepaliveInterval: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`,
              ),
            )

            unsubscribe = subscribeToKanbanEvents((event) => {
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
                  ),
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
