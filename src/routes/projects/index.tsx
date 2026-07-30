import { createFileRoute } from '@tanstack/react-router'
import { AllView } from '@/screens/projects/all-view'

export const Route = createFileRoute('/projects/')({
  ssr: false,
  component: () => <AllView />,
})
