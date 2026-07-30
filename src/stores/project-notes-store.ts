/**
 * Project notes state — per-project note lists and active note selection.
 * Note data is fetched and cached via React Query; this store holds UI state.
 */
import { create } from 'zustand'
import type { ProjectNote } from '@/lib/projects-types'

interface ProjectNotesState {
  notesByProject: Record<string, ProjectNote[]>
  activeNoteId: string | null
  setNotesForProject: (projectId: string, notes: ProjectNote[]) => void
  upsertNote: (projectId: string, note: ProjectNote) => void
  removeNote: (projectId: string, noteId: string) => void
  setActiveNote: (id: string | null) => void
  clearProject: (projectId: string) => void
}

export const useProjectNotesStore = create<ProjectNotesState>((set) => ({
  notesByProject: {},
  activeNoteId: null,

  setNotesForProject: (projectId, notes) =>
    set((s) => ({
      notesByProject: { ...s.notesByProject, [projectId]: notes },
    })),

  upsertNote: (projectId, note) =>
    set((s) => {
      const existing = s.notesByProject[projectId] ?? []
      const idx = existing.findIndex((n) => n.id === note.id)
      const updated =
        idx >= 0
          ? existing.map((n) => (n.id === note.id ? note : n))
          : [note, ...existing]
      return { notesByProject: { ...s.notesByProject, [projectId]: updated } }
    }),

  removeNote: (projectId, noteId) =>
    set((s) => {
      const existing = s.notesByProject[projectId] ?? []
      return {
        notesByProject: {
          ...s.notesByProject,
          [projectId]: existing.filter((n) => n.id !== noteId),
        },
      }
    }),

  setActiveNote: (activeNoteId) => set({ activeNoteId }),

  clearProject: (projectId) =>
    set((s) => {
      const next = { ...s.notesByProject }
      delete next[projectId]
      return { notesByProject: next }
    }),
}))
