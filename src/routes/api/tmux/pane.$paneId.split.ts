import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import { splitPane } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/pane/$paneId/split')({
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
        const direction = body.direction === 'v' ? 'v' : 'h'

        try {
          const result = await splitPane({ paneId: params.paneId, direction })
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
