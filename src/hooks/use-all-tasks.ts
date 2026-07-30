import { useQuery } from '@tanstack/react-query'
import type { ProjectTask, TaskFilters, TaskStatus } from '@/lib/projects-types'

export interface ProjectTaskWithMeta extends ProjectTask {
  project_name?: string
  project_icon?: string
}

export const ALL_TASKS_QUERY_KEY = ['project-tasks-all'] as const

export function useAllTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: [...ALL_TASKS_QUERY_KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status]
        params.set('status', (statuses as TaskStatus[]).join(','))
      }
      if (filters?.include_archived) {
        params.set('include_archived', 'true')
      }
      if (filters?.deadline_before != null) {
        params.set('deadline_before', String(filters.deadline_before))
      }
      const qs = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`/api/project-tasks-all${qs}`)
      if (!res.ok) throw new Error(`Failed to fetch all tasks (${res.status})`)
      return res.json() as Promise<{ tasks: ProjectTaskWithMeta[] }>
    },
    staleTime: 20_000,
  })
}
