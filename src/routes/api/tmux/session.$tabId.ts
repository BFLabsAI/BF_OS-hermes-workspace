import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import { killSession, renameSession } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/session/$tabId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const ok = killSession(params.tabId)
        return new Response(JSON.stringify({ ok }), {
          status: ok ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const name = typeof body.name === 'string' ? body.name : ''
        if (!name) {
          return new Response(JSON.stringify({ ok: false, error: 'name required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const ok = renameSession(params.tabId, name)
        return new Response(JSON.stringify({ ok }), {
          status: ok ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
