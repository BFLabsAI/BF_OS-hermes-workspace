import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  ComputerTerminal01Icon,
  FolderDetailsIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ROOT_DIRS = [
  { label: '~ root', path: '/root', icon: '🏠' },
  { label: 'hermes-workspace', path: '/root/hermes-workspace', icon: '🖥️' },
  { label: 'itarget-agents', path: '/root/itarget-agents', icon: '🤖' },
  { label: 'hermes', path: '/root/hermes', icon: '⚡' },
  { label: '.hermes', path: '/root/.hermes', icon: '⚙️' },
  { label: 'monorepo', path: '/root/monorepo', icon: '📦' },
  { label: 'agno-api-oficial', path: '/root/agno-api-oficial', icon: '🧠' },
  { label: 'falcon-crm', path: '/root/falcon-crm', icon: '🦅' },
  { label: 'n8n', path: '/root/n8n', icon: '🔗' },
  { label: 'BF-Second-Brain', path: '/root/BF-Second-Brain', icon: '🧬' },
  { label: 'skills', path: '/root/skills', icon: '🎯' },
  { label: 'workspace-development', path: '/root/workspace-development', icon: '🔧' },
]

const QUICK_COMMANDS = [
  { label: 'cloudfast', command: 'cloudfast', color: 'text-blue-400' },
  { label: 'codex', command: 'codex', color: 'text-purple-400' },
  { label: 'opencode', command: 'opencode', color: 'text-emerald-400' },
  { label: 'npm run dev', command: 'npm run dev', color: 'text-red-400' },
  { label: 'pnpm dev', command: 'pnpm dev', color: 'text-yellow-400' },
]

type NewTerminalDialogProps = {
  onConfirm: (options: { cwd: string; command?: string }) => void
  onCancel: () => void
}

export function NewTerminalDialog({ onConfirm, onCancel }: NewTerminalDialogProps) {
  const [selectedDir, setSelectedDir] = useState(ROOT_DIRS[0])
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)

  function handleOpen() {
    onConfirm({
      cwd: selectedDir.path,
      command: selectedCommand ?? undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-primary-300 bg-[#111] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-primary-300 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary-900">
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={16} strokeWidth={1.5} />
            New Terminal
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-primary-600 hover:bg-primary-200 hover:text-primary-900"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Directory picker */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary-600">
              <HugeiconsIcon icon={FolderDetailsIcon} size={13} strokeWidth={1.5} />
              Open in
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ROOT_DIRS.map((dir) => (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => setSelectedDir(dir)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                    selectedDir.path === dir.path
                      ? 'bg-orange-600/20 text-orange-400 ring-1 ring-orange-500/50'
                      : 'text-primary-700 hover:bg-primary-200/60 hover:text-primary-900',
                  )}
                >
                  <span className="shrink-0 text-sm leading-none">{dir.icon}</span>
                  <span className="truncate font-mono">{dir.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick commands */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary-600">
              <HugeiconsIcon icon={ComputerTerminal01Icon} size={13} strokeWidth={1.5} />
              Run command on open
              <span className="ml-auto text-primary-500 font-normal">optional</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() =>
                    setSelectedCommand((prev) =>
                      prev === cmd.command ? null : cmd.command,
                    )
                  }
                  className={cn(
                    'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                    selectedCommand === cmd.command
                      ? 'bg-primary-200 ring-1 ring-primary-400 ' + cmd.color
                      : 'bg-primary-100 text-primary-600 hover:bg-primary-200 hover:text-primary-900',
                  )}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-primary-300 px-4 py-3">
          <span className="truncate font-mono text-xs text-primary-500">
            {selectedDir.path}
            {selectedCommand ? ` → ${selectedCommand}` : ''}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleOpen}>
              Open
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
