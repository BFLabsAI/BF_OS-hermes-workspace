import { createFileRoute } from '@tanstack/react-router'
import { NotesList } from '@/screens/projects/notes-list'

export const Route = createFileRoute('/projects/$projectId/notes')({
  ssr: false,
  component: NotesRoute,
})

function NotesRoute() {
  const { projectId } = Route.useParams()
  return <NotesList projectId={projectId} />
}
