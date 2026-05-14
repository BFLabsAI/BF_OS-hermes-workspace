/**
 * GET /api/kanban-board — proxies to the canonical kanban dashboard plugin
 * at :9119/api/plugins/kanban/board.
 *
 * Returns the full 7-column board view (triage|todo|ready|running|blocked|done|archived).
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getBoard, KanbanApiError } from '../../server/hermes-kanban-api'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/kanban-board')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const tenant = url.searchParams.get('tenant') || undefined
        const include_archived =
          url.searchParams.get('include_archived') === 'true' ? true : undefined
        const board = url.searchParams.get('board') || undefined

        try {
          const view = await getBoard({ tenant, include_archived, board })
          return jsonResponse(view)
        } catch (err) {
          if (err instanceof KanbanApiError) {
            return jsonResponse(
              { error: err.message, status: err.status },
              err.status,
            )
          }
          return jsonResponse({ error: String(err) }, 502)
        }
      },
    },
  },
})
