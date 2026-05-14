import { describe, expect, it } from 'vitest'

import { formatAge, formatTaskAssigneeLabel, priorityMeta, statusHex } from './task-card'
import { TASKS_BOARD_HELP_TEXT } from './tasks-screen'

describe('tasks UX copy', () => {
  it('exposes helper copy that explains drag and assignment behavior', () => {
    expect(TASKS_BOARD_HELP_TEXT).toBe(
      'Drag cards to change status. Open a card to set assignee, priority, and view comments.',
    )
  })

  it('formats assignee labels explicitly for assigned and unassigned tasks', () => {
    expect(formatTaskAssigneeLabel('jarvis', { jarvis: 'Jarvis' })).toBe(
      'Assignee: Jarvis',
    )
    expect(formatTaskAssigneeLabel(null, {})).toBe('Assignee: Unassigned')
  })
})

describe('tasks card helpers', () => {
  it('formats age in seconds as a compact relative string', () => {
    expect(formatAge(null)).toBe('')
    expect(formatAge(0)).toBe('just now')
    expect(formatAge(30)).toBe('just now')
    expect(formatAge(60)).toBe('1m ago')
    expect(formatAge(60 * 5)).toBe('5m ago')
    expect(formatAge(3600)).toBe('1h ago')
    expect(formatAge(3600 * 2)).toBe('2h ago')
    expect(formatAge(86_400)).toBe('1d ago')
    expect(formatAge(86_400 * 3)).toBe('3d ago')
  })

  it('maps integer priorities to P-labels with colors', () => {
    expect(priorityMeta(0).label).toBe('P0')
    expect(priorityMeta(1).label).toBe('P1')
    expect(priorityMeta(2).label).toBe('P2')
    expect(priorityMeta(3).label).toBe('P3')
    // Anything beyond the table still produces a numeric badge.
    expect(priorityMeta(7).label).toBe('P7')
    expect(priorityMeta(0).hex).toMatch(/^#/)
  })

  it('returns a hex color for each canonical status', () => {
    for (const status of [
      'triage',
      'todo',
      'ready',
      'running',
      'blocked',
      'done',
      'archived',
    ] as const) {
      expect(statusHex(status)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
