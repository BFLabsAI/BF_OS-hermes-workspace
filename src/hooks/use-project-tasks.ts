import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateTaskInput,
  ProjectTask,
  ProjectTaskDetail,
  TaskFilters,
  TaskStatus,
  UpdateTaskInput,
} from '@/lib/projects-types'

export function projectTasksQueryKey(projectId: string) {
  return ['project-tasks', projectId] as const
}

export function taskQueryKey(taskId: string) {
  return ['project-task', taskId] as const
}

// ── Queries ───────────────────────────────────────────────────────────

export function useProjectTasks(
  projectId: string | null,
  filters?: TaskFilters,
) {
  return useQuery({
    queryKey: projectId
      ? [...projectTasksQueryKey(projectId), filters]
      : ['project-tasks-disabled'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status]
        params.set('status', statuses.join(','))
      }
      if (filters?.include_archived) {
        params.set('include_archived', 'true')
      }
      if (filters?.deadline_before != null) {
        params.set('deadline_before', String(filters.deadline_before))
      }
      const qs = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`/api/projects/${projectId}/tasks${qs}`)
      if (!res.ok)
        throw new Error(`Failed to fetch tasks (${res.status})`)
      return res.json() as Promise<{ tasks: ProjectTask[] }>
    },
    enabled: !!projectId,
    staleTime: 20_000,
  })
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: id ? taskQueryKey(id) : ['project-task-disabled'],
    queryFn: async () => {
      const res = await fetch(`/api/project-tasks/${id}`)
      if (!res.ok) throw new Error(`Failed to fetch task (${res.status})`)
      return res.json() as Promise<{ task: ProjectTaskDetail }>
    },
    enabled: !!id,
    staleTime: 20_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      input,
    }: {
      projectId: string
      input: CreateTaskInput
    }) => {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to create task (${res.status})`)
      return res.json() as Promise<{ task: ProjectTask }>
    },
    onSuccess: (_data, { projectId }) => {
      void qc.invalidateQueries({
        queryKey: projectTasksQueryKey(projectId),
      })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      projectId,
    }: {
      id: string
      patch: UpdateTaskInput
      projectId?: string
    }) => {
      const res = await fetch(`/api/project-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`Failed to update task (${res.status})`)
      return res.json() as Promise<{ task: ProjectTask }>
    },
    onSuccess: (_data, { id, projectId }) => {
      void qc.invalidateQueries({ queryKey: taskQueryKey(id) })
      if (projectId) {
        void qc.invalidateQueries({
          queryKey: projectTasksQueryKey(projectId),
        })
      }
    },
  })
}

export function useArchiveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      projectId: _projectId,
    }: {
      id: string
      projectId?: string
    }) => {
      const res = await fetch(`/api/project-tasks/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to archive task (${res.status})`)
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: (_data, { id, projectId }) => {
      void qc.invalidateQueries({ queryKey: taskQueryKey(id) })
      if (projectId) {
        void qc.invalidateQueries({
          queryKey: projectTasksQueryKey(projectId),
        })
      }
    },
  })
}

export function useMoveTask() {
  const updateTask = useUpdateTask()
  return {
    ...updateTask,
    mutateAsync: ({
      id,
      status,
      projectId,
    }: {
      id: string
      status: TaskStatus
      projectId?: string
    }) => updateTask.mutateAsync({ id, patch: { status }, projectId }),
  }
}
