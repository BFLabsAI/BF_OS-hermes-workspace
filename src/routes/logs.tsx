import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { LogsScreen } from '@/screens/logs/logs-screen'

export const Route = createFileRoute('/logs')({
  ssr: false,
  component: LogsRoute,
})

function LogsRoute() {
  usePageTitle('Logs')
  return <LogsScreen />
}
