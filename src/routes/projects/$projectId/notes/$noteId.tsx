import { createFileRoute } from '@tanstack/react-router'
import { NoteEditor } from '@/screens/projects/note-editor'

export const Route = createFileRoute('/projects/$projectId/notes/$noteId')({
  ssr: false,
  component: NoteEditorRoute,
})

function NoteEditorRoute() {
  const { projectId, noteId } = Route.useParams()
  return <NoteEditor noteId={noteId} projectId={projectId} />
}
