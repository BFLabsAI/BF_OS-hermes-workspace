import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useProjectNotes } from '@/hooks/use-project-notes'
import { cn } from '@/lib/utils'

interface NoteEditorProps {
  noteId: string
  projectId: string
}

// We derive the note from the project notes list for simplicity
// (no dedicated useNote hook required)
export function NoteEditor({ noteId, projectId }: NoteEditorProps) {
  const navigate = useNavigate()
  const { data: notesData, isLoading } = useProjectNotes(projectId)
  const notes = notesData?.notes ?? []
  const note = notes.find((n) => n.id === noteId)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!note) return
    setTitle(note.title ?? '')
    setBody(note.body_json ?? '')
  }, [note])

  // Auto-save helpers — TODO: wire to useUpdateNote hook when available
  const handleTitleChange = useCallback((val: string) => {
    setTitle(val)
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    // titleDebounceRef.current = setTimeout(() => updateNote.mutate({ id: noteId, title: val }), 800)
  }, [])

  const handleBodyChange = useCallback((val: string) => {
    setBody(val)
    if (bodyDebounceRef.current) clearTimeout(bodyDebounceRef.current)
    // bodyDebounceRef.current = setTimeout(() => updateNote.mutate({ id: noteId, body_json: val }), 800)
  }, [])

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--theme-muted)] text-xs">
        Carregando nota…
      </div>
    )
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--theme-muted)] text-xs">
        Nota não encontrada
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--theme-border)] shrink-0">
        <button
          type="button"
          onClick={() =>
            void navigate({
              to: '/projects/$projectId/notes',
              params: { projectId },
            })
          }
          className="text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors flex items-center gap-1"
        >
          ← Voltar
        </button>
        <span className="text-[var(--theme-border)]">|</span>
        <input
          className={cn(
            'flex-1 bg-transparent border-none text-sm font-medium text-[var(--theme-text)]',
            'focus:outline-none placeholder:text-[var(--theme-muted)]',
          )}
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Título da nota"
        />
      </div>

      {/* Body */}
      <div className="flex-1 p-4">
        <textarea
          className={cn(inputClass, 'resize-none h-full min-h-[300px]')}
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="Escreva sua nota aqui…"
        />
      </div>
    </div>
  )
}
