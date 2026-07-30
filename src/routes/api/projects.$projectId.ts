/**
 * GET    /api/projects/:projectId — get project detail
 * PATCH  /api/projects/:projectId — update project
 * DELETE /api/projects/:projectId — archive project
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  archiveProject,
  getProject,
  ProjectsApiError,
  updateProject,
} from '../../server/hermes-projects-api'
import type { UpdateProjectInput } from '../../lib/projects-types'

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

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await getProject(params.projectId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        const patch: UpdateProjectInput = {}
        if (typeof body.name === 'string') patch.name = body.name
        if (typeof body.icon === 'string') patch.icon = body.icon
        if (typeof body.color === 'string') patch.color = body.color
        if (typeof body.description === 'string')
          patch.description = body.description

        try {
          const data = await updateProject(params.projectId, patch)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await archiveProject(params.projectId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
