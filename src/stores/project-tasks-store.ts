/**
 * Project tasks state — per-project task lists and active task selection.
 * Task data is fetched and cached via React Query; this store holds UI state.
 */
import { create } from 'zustand'
import type { ProjectTask } from '@/lib/projects-types'

interface ProjectTasksState {
  tasksByProject: Record<string, ProjectTask[]>
  activeTaskId: string | null
  setTasksForProject: (projectId: string, tasks: ProjectTask[]) => void
  upsertTask: (projectId: string, task: ProjectTask) => void
  removeTask: (projectId: string, taskId: string) => void
  setActiveTask: (id: string | null) => void
  clearProject: (projectId: string) => void
}

export const useProjectTasksStore = create<ProjectTasksState>((set) => ({
  tasksByProject: {},
  activeTaskId: null,

  setTasksForProject: (projectId, tasks) =>
    set((s) => ({
      tasksByProject: { ...s.tasksByProject, [projectId]: tasks },
    })),

  upsertTask: (projectId, task) =>
    set((s) => {
      const existing = s.tasksByProject[projectId] ?? []
      const idx = existing.findIndex((t) => t.id === task.id)
      const updated =
        idx >= 0
          ? existing.map((t) => (t.id === task.id ? task : t))
          : [task, ...existing]
      return { tasksByProject: { ...s.tasksByProject, [projectId]: updated } }
    }),

  removeTask: (projectId, taskId) =>
    set((s) => {
      const existing = s.tasksByProject[projectId] ?? []
      return {
        tasksByProject: {
          ...s.tasksByProject,
          [projectId]: existing.filter((t) => t.id !== taskId),
        },
      }
    }),

  setActiveTask: (activeTaskId) => set({ activeTaskId }),

  clearProject: (projectId) =>
    set((s) => {
      const next = { ...s.tasksByProject }
      delete next[projectId]
      return { tasksByProject: next }
    }),
}))
