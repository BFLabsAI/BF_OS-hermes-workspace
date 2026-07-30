import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  DialogContent,
  DialogRoot,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateProject } from '@/hooks/use-projects'

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📁')
  const [color, setColor] = useState('#6366f1')
  const [description, setDescription] = useState('')

  const createProject = useCreateProject()

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )
  const labelClass = 'block text-xs font-medium text-[var(--theme-muted)] mb-1'

  function handleClose() {
    setName('')
    setIcon('📁')
    setColor('#6366f1')
    setDescription('')
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createProject.mutateAsync({
      name: name.trim(),
      icon: icon || '📁',
      color: color || '#6366f1',
      description: description.trim() || undefined,
    })
    handleClose()
  }

  return (
    <DialogRoot open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="w-[min(480px,95vw)] border-[var(--theme-border)] bg-[var(--theme-bg)] overflow-hidden">
        <div className="h-[3px] w-full" style={{ background: 'var(--theme-accent)' }} />
        <div className="p-5">
          <DialogTitle className="text-base font-semibold text-[var(--theme-text)] mb-1">
            Novo Projeto
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--theme-muted)] mb-4">
            Crie um projeto para organizar tasks, notas e entregas.
          </DialogDescription>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={labelClass}>Nome *</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do projeto"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Ícone (emoji)</label>
                <input
                  className={inputClass}
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="📁"
                  maxLength={4}
                />
              </div>
              <div>
                <label className={labelClass}>Cor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-10 rounded-lg border border-[var(--theme-border)] cursor-pointer bg-transparent p-0.5"
                  />
                  <input
                    className={cn(inputClass, 'flex-1')}
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#6366f1"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Descrição</label>
              <textarea
                className={cn(inputClass, 'resize-none')}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional…"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={createProject.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createProject.isPending || !name.trim()}
                style={{ background: 'var(--theme-accent)', color: 'white' }}
              >
                {createProject.isPending ? 'Criando…' : 'Criar Projeto'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
