type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'error'

export default function SaveStatus({ status }: { status: SaveStatusKind }) {
  const label: Record<SaveStatusKind, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }
  if (!label[status]) return null
  return (
    <div className="text-[11px] text-muted-foreground pointer-events-none select-none">
      {label[status]}
    </div>
  )
}

export type { SaveStatusKind }
