import { useNavigate } from '@tanstack/react-router'
import { useProjectNotes, useCreateNote } from '@/hooks/use-project-notes'
import { cn } from '@/lib/utils'

interface NotesListProps {
  projectId: string
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return ''
  try {
    return new Date(timestamp * 1000).toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

export function NotesList({ projectId }: NotesListProps) {
  const navigate = useNavigate()
  const { data: notesData, isLoading } = useProjectNotes(projectId)
  const notes = notesData?.notes ?? []
  const createNote = useCreateNote()

  async function handleNewNote() {
    const title = window.prompt('Título da nota:')
    if (!title?.trim()) return
    const result = await createNote.mutateAsync({ projectId, input: { title: title.trim() } })
    void navigate({
      to: '/projects/$projectId/notes/$noteId',
      params: { projectId, noteId: result.note.id },
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)]">
        <h2 className="text-sm font-medium text-[var(--theme-text)]">Notas</h2>
        <button
          type="button"
          onClick={() => void handleNewNote()}
          disabled={createNote.isPending}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors text-white"
          style={{ background: 'var(--theme-accent)' }}
        >
          + Nova Nota
        </button>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-lg border border-[var(--theme-border)] animate-pulse bg-[var(--theme-card)]"
              />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--theme-muted)]">
            <p className="text-2xl mb-2">📝</p>
            <p className="text-sm font-medium">Nenhuma nota ainda</p>
            <button
              type="button"
              onClick={() => void handleNewNote()}
              className="mt-3 text-xs text-[var(--theme-accent)] hover:underline"
            >
              Criar primeira nota
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() =>
                  void navigate({
                    to: '/projects/$projectId/notes/$noteId',
                    params: { projectId, noteId: note.id },
                  })
                }
                className={cn(
                  'w-full text-left rounded-lg border px-4 py-3 transition-all',
                  'bg-[var(--theme-card)] border-[var(--theme-border)]',
                  'hover:border-[var(--theme-accent)] hover:shadow-md',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--theme-text)] line-clamp-1">
                    {note.title || 'Sem título'}
                  </p>
                  <span className="text-[10px] text-[var(--theme-muted)] shrink-0">
                    {formatDate(note.updated_at ?? note.created_at)}
                  </span>
                </div>
                {note.body_json && (
                  <p className="text-xs text-[var(--theme-muted)] mt-1 line-clamp-2">
                    {note.body_json.slice(0, 100)}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
