/**
 * Global projects state — active project selection, sidebar collapse, loading.
 * Does NOT store task/note data — those live in their own stores and React Query cache.
 */
import { create } from 'zustand'
import type { Project } from '@/lib/projects-types'

interface ProjectsState {
  projects: Project[]
  activeProjectId: string | null
  sidebarCollapsed: boolean
  loading: boolean
  setProjects: (projects: Project[]) => void
  setActiveProject: (id: string | null) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setLoading: (v: boolean) => void
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  activeProjectId: null,
  sidebarCollapsed: false,
  loading: false,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setLoading: (loading) => set({ loading }),
}))
