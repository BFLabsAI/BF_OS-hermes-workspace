import { useCallback, useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  FolderAddIcon,
} from '@hugeicons/core-free-icons'
import {
  DialogClose,
  DialogContent,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FolderEntry {
  name: string
  path: string
  type: 'file' | 'folder'
}

interface NewFileDialogProps {
  open: boolean
  /** Initial folder path to start the picker at. Defaults to root (''). */
  initialPath?: string
  onClose: () => void
  /** Called with the final `${parentPath}/${name}` when the user confirms. */
  onCreate: (parentPath: string, fileName: string) => void
}

async function listFolders(parentPath: string): Promise<Array<FolderEntry>> {
  const qs = new URLSearchParams({ action: 'list' })
  if (parentPath) qs.set('path', parentPath)
  const res = await fetch(`/api/files?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed to list ${parentPath || '/'}`)
  const data = (await res.json()) as { entries?: Array<FolderEntry> }
  return (data.entries || []).filter((e) => e.type === 'folder')
}

async function createFolder(targetPath: string): Promise<void> {
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'mkdir', path: targetPath }),
  })
  if (!res.ok) throw new Error('Failed to create folder')
}

export function NewFileDialog({
  open,
  initialPath = '',
  onClose,
  onCreate,
}: NewFileDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [folders, setFolders] = useState<Array<FolderEntry>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Reset state when the dialog opens
  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath)
      setFileName('')
      setNewFolderMode(false)
      setNewFolderName('')
      setError(null)
    }
  }, [open, initialPath])

  // Load folders at the current path
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    listFolders(currentPath)
      .then((entries) => {
        if (!cancelled) setFolders(entries)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, currentPath])

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : []

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path)
    setNewFolderMode(false)
  }, [])

  const navigateUp = useCallback(() => {
    if (!currentPath) return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath(parts.join('/'))
    setNewFolderMode(false)
  }, [currentPath])

  const handleConfirmNewFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return
    const folderPath = currentPath ? `${currentPath}/${name}` : name
    try {
      await createFolder(folderPath)
      setNewFolderMode(false)
      setNewFolderName('')
      // Refresh folder list
      const entries = await listFolders(currentPath)
      setFolders(entries)
      // Auto-navigate into the new folder
      setCurrentPath(folderPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [currentPath, newFolderName])

  const handleCreate = useCallback(() => {
    const name = fileName.trim()
    if (!name) return
    onCreate(currentPath, name)
  }, [currentPath, fileName, onCreate])

  const displayLocation = currentPath ? `/${currentPath}` : '/'

  return (
    <DialogRoot open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-[min(560px,96vw)]">
        <div className="p-5 space-y-4">
          <DialogTitle className="text-base font-semibold">
            Create new file
          </DialogTitle>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => navigateTo('')}
              className={cn(
                'px-1.5 py-0.5 rounded hover:bg-primary-100 font-mono',
                currentPath === '' && 'bg-primary-100 font-semibold',
              )}
            >
              /root
            </button>
            {breadcrumbs.map((seg, i) => {
              const segPath = breadcrumbs.slice(0, i + 1).join('/')
              const isLast = i === breadcrumbs.length - 1
              return (
                <span key={segPath} className="flex items-center gap-1">
                  <HugeiconsIcon icon={ArrowRight01Icon} size={10} className="text-primary-400" />
                  <button
                    type="button"
                    onClick={() => navigateTo(segPath)}
                    className={cn(
                      'px-1.5 py-0.5 rounded hover:bg-primary-100 font-mono',
                      isLast && 'bg-primary-100 font-semibold',
                    )}
                  >
                    {seg}
                  </button>
                </span>
              )
            })}
          </div>

          {/* Folder list */}
          <div className="border border-primary-200 rounded-lg overflow-hidden">
            {currentPath && (
              <button
                type="button"
                onClick={navigateUp}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary-100 border-b border-primary-200 text-primary-700"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                <span className="font-mono text-xs">..</span>
              </button>
            )}
            <div className="max-h-[260px] overflow-y-auto">
              {loading ? (
                <div className="px-3 py-6 text-center text-xs text-primary-500">
                  Loading…
                </div>
              ) : error ? (
                <div className="px-3 py-3 text-xs text-rose-600">{error}</div>
              ) : folders.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-primary-500 italic">
                  No subfolders. New file will be created at{' '}
                  <span className="font-mono">{displayLocation}</span>.
                </div>
              ) : (
                folders.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => navigateTo(f.path)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-primary-100 text-left"
                  >
                    <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.6} />
                    <span className="truncate flex-1">{f.name}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-primary-400" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* New folder at current location */}
          {newFolderMode ? (
            <div className="flex items-center gap-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleConfirmNewFolder() }
                  if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') }
                }}
                placeholder="New folder name"
                autoFocus
                className="flex-1 rounded-md border border-primary-200 bg-primary-50 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <Button size="sm" onClick={() => void handleConfirmNewFolder()} disabled={!newFolderName.trim()}>
                Create folder
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setNewFolderMode(false); setNewFolderName('') }}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNewFolderMode(true)}
              className="flex items-center gap-2 text-xs text-primary-600 hover:text-primary-900 transition-colors"
            >
              <HugeiconsIcon icon={FolderAddIcon} size={14} />
              New folder here ({displayLocation})
            </button>
          )}

          {/* File name + actions */}
          <div className="space-y-2 pt-2 border-t border-primary-200">
            <label className="text-xs font-medium text-primary-700 block">File name</label>
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && fileName.trim()) { e.preventDefault(); handleCreate() }
              }}
              placeholder="example.ts"
              className="w-full rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <p className="text-[11px] text-primary-500 font-mono">
              Will create: <span className="text-primary-700">{displayLocation}{currentPath ? '/' : ''}{fileName || <span className="italic opacity-60">…</span>}</span>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button onClick={handleCreate} disabled={!fileName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
