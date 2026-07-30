import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateNoteInput,
  ProjectNote,
  UpdateNoteInput,
} from '@/lib/projects-types'

export function projectNotesQueryKey(projectId: string) {
  return ['project-notes', projectId] as const
}

export function noteQueryKey(noteId: string) {
  return ['project-note', noteId] as const
}

// ── Queries ───────────────────────────────────────────────────────────

export function useProjectNotes(projectId: string | null) {
  return useQuery({
    queryKey: projectId
      ? projectNotesQueryKey(projectId)
      : ['project-notes-disabled'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/notes`)
      if (!res.ok) throw new Error(`Failed to fetch notes (${res.status})`)
      return res.json() as Promise<{ notes: ProjectNote[] }>
    },
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: id ? noteQueryKey(id) : ['project-note-disabled'],
    queryFn: async () => {
      const res = await fetch(`/api/project-notes/${id}`)
      if (!res.ok) throw new Error(`Failed to fetch note (${res.status})`)
      return res.json() as Promise<{ note: ProjectNote }>
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      input,
    }: {
      projectId: string
      input: CreateNoteInput
    }) => {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to create note (${res.status})`)
      return res.json() as Promise<{ note: ProjectNote }>
    },
    onSuccess: (_data, { projectId }) => {
      void qc.invalidateQueries({ queryKey: projectNotesQueryKey(projectId) })
    },
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      projectId,
    }: {
      id: string
      patch: UpdateNoteInput
      projectId?: string
    }) => {
      const res = await fetch(`/api/project-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`Failed to update note (${res.status})`)
      return res.json() as Promise<{ note: ProjectNote }>
    },
    onSuccess: (_data, { id, projectId }) => {
      void qc.invalidateQueries({ queryKey: noteQueryKey(id) })
      if (projectId) {
        void qc.invalidateQueries({ queryKey: projectNotesQueryKey(projectId) })
      }
    },
  })
}

export function useArchiveNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      projectId: _projectId,
    }: {
      id: string
      projectId?: string
    }) => {
      const res = await fetch(`/api/project-notes/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to archive note (${res.status})`)
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: (_data, { id, projectId }) => {
      void qc.invalidateQueries({ queryKey: noteQueryKey(id) })
      if (projectId) {
        void qc.invalidateQueries({ queryKey: projectNotesQueryKey(projectId) })
      }
    },
  })
}
