import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateDeliverableInput,
  Deliverable,
} from '@/lib/projects-types'

export function deliverablesQueryKey(taskId: string) {
  return ['project-deliverables', taskId] as const
}

// ── Queries ───────────────────────────────────────────────────────────

export function useDeliverables(taskId: string | null) {
  return useQuery({
    queryKey: taskId
      ? deliverablesQueryKey(taskId)
      : ['project-deliverables-disabled'],
    queryFn: async () => {
      const res = await fetch(`/api/project-tasks/${taskId}/deliverables`)
      if (!res.ok)
        throw new Error(`Failed to fetch deliverables (${res.status})`)
      return res.json() as Promise<{ deliverables: Deliverable[] }>
    },
    enabled: !!taskId,
    staleTime: 30_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────

export function useAddDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      input,
    }: {
      taskId: string
      input: CreateDeliverableInput
    }) => {
      const res = await fetch(`/api/project-tasks/${taskId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to add deliverable (${res.status})`)
      return res.json() as Promise<{ deliverable: Deliverable }>
    },
    onSuccess: (_data, { taskId }) => {
      void qc.invalidateQueries({ queryKey: deliverablesQueryKey(taskId) })
      // also invalidate the task detail so linked_deliverables updates
      void qc.invalidateQueries({ queryKey: ['project-task', taskId] })
    },
  })
}
