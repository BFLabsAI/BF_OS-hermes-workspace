import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listAll } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const sessions = listAll()
        return new Response(JSON.stringify({ ok: true, sessions }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
