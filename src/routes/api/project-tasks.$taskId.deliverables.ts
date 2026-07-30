/**
 * GET  /api/project-tasks/:taskId/deliverables — list deliverables for a task
 * POST /api/project-tasks/:taskId/deliverables — add a deliverable
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  addDeliverable,
  listDeliverables,
  ProjectsApiError,
} from '../../server/hermes-projects-api'
import {
  isDeliverableKind,
  type CreateDeliverableInput,
} from '../../lib/projects-types'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function handleApiError(err: unknown): Response {
  if (err instanceof ProjectsApiError) {
    return jsonResponse({ error: err.message, status: err.status }, err.status)
  }
  return jsonResponse({ error: String(err) }, 502)
}

export const Route = createFileRoute(
  '/api/project-tasks/$taskId/deliverables',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await listDeliverables(params.taskId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        if (!isDeliverableKind(body.kind)) {
          return jsonResponse(
            { error: 'kind is required and must be file|link|text|image|action' },
            400,
          )
        }
        if (!body.title || typeof body.title !== 'string') {
          return jsonResponse({ error: 'title is required' }, 400)
        }

        const input: CreateDeliverableInput = {
          kind: body.kind,
          title: body.title,
        }
        if (body.payload && typeof body.payload === 'object') {
          input.payload = body.payload as Record<string, unknown>
        }
        if (body.source_type === 'run' || body.source_type === 'session') {
          input.source_type = body.source_type
        }
        if (typeof body.source_id === 'string') input.source_id = body.source_id
        if (typeof body.source_agent === 'string')
          input.source_agent = body.source_agent

        try {
          const data = await addDeliverable(params.taskId, input)
          return jsonResponse(data, 201)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
