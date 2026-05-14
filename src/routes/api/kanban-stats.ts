/**
 * GET /api/kanban-stats — canonical kanban metrics
 * (by_status, by_assignee, oldest_ready_age_seconds).
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getStats, KanbanApiError } from '../../server/hermes-kanban-api'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/kanban-stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const board = url.searchParams.get('board') || undefined

        try {
          const stats = await getStats({ board })
          return jsonResponse(stats)
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
