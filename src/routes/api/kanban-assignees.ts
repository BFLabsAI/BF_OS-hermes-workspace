/**
 * GET /api/kanban-assignees — canonical assignee list from kanban plugin.
 * Returns {assignees: [{name, on_disk, counts}]}.
 *
 * To preserve back-compat with the existing /api/hermes-tasks-assignees
 * shape ({id, label, isHuman}), this route also exposes a `?compat=ui`
 * mode that maps to the legacy shape.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getAssignees, KanbanApiError } from '../../server/hermes-kanban-api'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/kanban-assignees')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const board = url.searchParams.get('board') || undefined
        const compat = url.searchParams.get('compat')

        try {
          const { assignees } = await getAssignees({ board })

          if (compat === 'ui') {
            const ui = assignees.map((a) => ({
              id: a.name,
              label: a.name,
              isHuman: false,
              on_disk: a.on_disk,
              counts: a.counts,
            }))
            return jsonResponse({ assignees: ui })
          }

          return jsonResponse({ assignees })
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
