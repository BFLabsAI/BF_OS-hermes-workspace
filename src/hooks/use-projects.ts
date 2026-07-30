import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@/lib/projects-types'

export const PROJECTS_QUERY_KEY = ['projects'] as const

// ── Queries ───────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error(`Failed to fetch projects (${res.status})`)
      return res.json() as Promise<{ projects: Project[] }>
    },
    staleTime: 30_000,
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error(`Failed to fetch project (${res.status})`)
      return res.json() as Promise<{ project: Project }>
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to create project (${res.status})`)
      return res.json() as Promise<{ project: Project }>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: UpdateProjectInput
    }) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`Failed to update project (${res.status})`)
      return res.json() as Promise<{ project: Project }>
    },
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to archive project (${res.status})`)
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })
}
