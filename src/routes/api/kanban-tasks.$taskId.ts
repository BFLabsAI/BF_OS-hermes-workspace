/**
 * /api/kanban-tasks/:taskId — task detail + lifecycle operations
 *   GET           → full detail (task + comments + events + links + runs)
 *   PATCH         → status/assignee/priority/etc. updates
 *   POST ?action=
 *     comment     → body=author/comment body
 *     reclaim     → body={reason}
 *     reassign    → body={profile, reclaim_first, reason}
 *     archive     → no body (sets status=archived)
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  addComment,
  getTask,
  KanbanApiError,
  reassignTask,
  reclaimTask,
  updateTask,
} from '../../server/hermes-kanban-api'
import { isTaskStatus, type UpdateTaskInput } from '../../lib/kanban-types'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseUpdateInput(body: Record<string, unknown>): UpdateTaskInput {
  const patch: UpdateTaskInput = {}
  if (isTaskStatus(body.status)) patch.status = body.status
  if (body.assignee === null || typeof body.assignee === 'string')
    patch.assignee = body.assignee as string | null
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (typeof body.title === 'string') patch.title = body.title
  if (body.body === null || typeof body.body === 'string')
    patch.body = body.body as string | null
  if (body.result === null || typeof body.result === 'string')
    patch.result = body.result as string | null
  if (typeof body.block_reason === 'string') patch.block_reason = body.block_reason
  if (typeof body.summary === 'string') patch.summary = body.summary
  if (body.metadata && typeof body.metadata === 'object')
    patch.metadata = body.metadata as Record<string, unknown>
  return patch
}

function handleApiError(err: unknown): Response {
  if (err instanceof KanbanApiError) {
    return jsonResponse(
      { error: err.message, status: err.status },
      err.status,
    )
  }
  return jsonResponse({ error: String(err) }, 502)
}

export const Route = createFileRoute('/api/kanban-tasks/$taskId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        const url = new URL(request.url)
        const board = url.searchParams.get('board') || undefined
        try {
          const detail = await getTask(params.taskId, { board })
          return jsonResponse(detail)
        } catch (err) {
          return handleApiError(err)
        }
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        const url = new URL(request.url)
        const board = url.searchParams.get('board') || undefined

        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        const patch = parseUpdateInput(body)
        try {
          const result = await updateTask(params.taskId, patch, { board })
          return jsonResponse(result)
        } catch (err) {
          return handleApiError(err)
        }
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        const url = new URL(request.url)
        const action = url.searchParams.get('action')
        const board = url.searchParams.get('board') || undefined

        let body: Record<string, unknown> = {}
        try {
          const raw = await request.text()
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        try {
          switch (action) {
            case 'comment': {
              if (typeof body.body !== 'string') {
                return jsonResponse({ error: 'body is required' }, 400)
              }
              const author =
                typeof body.author === 'string' ? body.author : undefined
              const result = await addComment(
                params.taskId,
                body.body,
                author,
                { board },
              )
              return jsonResponse(result, 201)
            }
            case 'reclaim': {
              const reason =
                typeof body.reason === 'string' ? body.reason : undefined
              const result = await reclaimTask(params.taskId, reason, { board })
              return jsonResponse(result)
            }
            case 'reassign': {
              const profile =
                typeof body.profile === 'string' ? body.profile : undefined
              const reclaim_first =
                typeof body.reclaim_first === 'boolean'
                  ? body.reclaim_first
                  : undefined
              const reason =
                typeof body.reason === 'string' ? body.reason : undefined
              const result = await reassignTask(
                params.taskId,
                { profile, reclaim_first, reason },
                { board },
              )
              return jsonResponse(result)
            }
            case 'archive': {
              const result = await updateTask(
                params.taskId,
                { status: 'archived' },
                { board },
              )
              return jsonResponse(result)
            }
            default:
              return jsonResponse(
                { error: `Unsupported action: ${action ?? '(none)'}` },
                400,
              )
          }
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
