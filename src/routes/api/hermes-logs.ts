/**
 * GET /api/hermes-logs — recent lines from ~/.hermes/logs/*.log
 * Query: limit, source (agent|errors|gateway|all), level, search, since
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { ensureHermesLogTailerStarted, getRecentHermesLogs } from '../../server/hermes-log-tailer'

export const Route = createFileRoute('/api/hermes-logs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        await ensureHermesLogTailerStarted()
        const url = new URL(request.url)
        const limit = parseInt(url.searchParams.get('limit') ?? '500', 10)
        const source = (url.searchParams.get('source') ?? 'all') as 'all' | 'agent' | 'errors' | 'gateway'
        const level = (url.searchParams.get('level') ?? 'all') as 'all' | 'debug' | 'info' | 'warn' | 'error'
        const search = url.searchParams.get('search') ?? undefined
        const since = url.searchParams.get('since') ? parseInt(url.searchParams.get('since')!, 10) : undefined
        const entries = getRecentHermesLogs({ limit, source, level, search, since })
        return new Response(JSON.stringify({ entries }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
