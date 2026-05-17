import type { Entry } from '../../lib/freewrite-api'

interface Props {
  entries: Entry[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Sidebar({ entries, activeId, onSelect, onDelete }: Props) {
  return (
    <div className="w-56 flex-shrink-0 border-r border-border flex flex-col overflow-y-auto">
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground p-4">No entries yet.</p>
      )}
      {entries.map(entry => (
        <div
          key={entry.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(entry.id)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(entry.id) }}
          className={`group relative px-4 py-3 cursor-pointer hover:bg-muted transition-colors border-b border-border ${activeId === entry.id ? 'bg-muted' : ''}`}
        >
          <div className="flex items-center gap-2 mb-0.5">
            {entry.is_video && <span className="text-xs">▶</span>}
            <span className="text-xs text-muted-foreground">{relativeTime(entry.created_at)}</span>
          </div>
          {!entry.is_video && entry.preview && (
            <p className="text-xs truncate text-foreground/80">{entry.preview}</p>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
            className="absolute right-2 top-2 text-xs opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
