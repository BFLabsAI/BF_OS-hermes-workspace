/**
 * POST /api/kanban-dispatch — nudge the kanban dispatcher.
 * Optional query: ?dry_run=&max=&board=
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { KanbanApiError, nudgeDispatcher } from '../../server/hermes-kanban-api'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/kanban-dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const dry_run = url.searchParams.get('dry_run') === 'true'
        const maxRaw = url.searchParams.get('max')
        const max = maxRaw ? Number(maxRaw) : undefined
        const board = url.searchParams.get('board') || undefined

        try {
          const result = await nudgeDispatcher({
            dry_run: dry_run || undefined,
            max: Number.isFinite(max) ? max : undefined,
            board,
          })
          return jsonResponse(result)
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
