/**
 * GET /api/projects — list all projects
 * POST /api/projects — create a project
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createProject,
  listProjects,
  ProjectsApiError,
} from '../../server/hermes-projects-api'
import type { CreateProjectInput } from '../../lib/projects-types'

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

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await listProjects()
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        if (!body.name || typeof body.name !== 'string') {
          return jsonResponse({ error: 'name is required' }, 400)
        }

        const input: CreateProjectInput = { name: body.name }
        if (typeof body.icon === 'string') input.icon = body.icon
        if (typeof body.color === 'string') input.color = body.color
        if (typeof body.description === 'string')
          input.description = body.description

        try {
          const data = await createProject(input)
          return jsonResponse(data, 201)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
