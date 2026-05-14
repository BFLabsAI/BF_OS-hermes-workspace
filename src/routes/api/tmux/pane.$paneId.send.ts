import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import { sendCommand } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/pane/$paneId/send')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const command = typeof body.command === 'string' ? body.command : ''
        const keys = typeof body.keys === 'string' ? body.keys : command
        const submit = body.submit !== false // default true

        if (!keys) {
          return new Response(JSON.stringify({ ok: false, error: 'command or keys required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const ok = sendCommand(params.paneId, keys, submit)
        return new Response(JSON.stringify({ ok }), {
          status: ok ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
