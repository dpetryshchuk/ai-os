import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Entry { id: string; created_at: string; preview: string }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/writing/freewrite' + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

const api = {
  list: () => req<{ entries: Entry[] }>('GET', '/entries').then(d => d.entries),
  create: () => req<{ id: string }>('POST', '/entries').then(d => d.id),
  get: (id: string) => req<{ text: string }>('GET', `/entries/${id}`).then(d => d.text),
  save: (id: string, text: string) => req('PUT', `/entries/${id}`, { text }),
  delete: (id: string) => req('DELETE', `/entries/${id}`),
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Freewrite() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const hasAutoSelected = useRef(false)

  useEffect(() => { api.list().then(setEntries).catch(() => {}) }, [])

  useEffect(() => {
    if (hasAutoSelected.current || entries.length === 0) return
    hasAutoSelected.current = true
    selectEntry(entries[0].id)
  }, [entries])

  const selectEntry = useCallback(async (id: string) => {
    activeIdRef.current = id
    setActiveId(id)
    const t = await api.get(id)
    if (activeIdRef.current === id) setText(t)
  }, [])

  const scheduleSave = useCallback((id: string, value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      api.save(id, value).catch(() => {})
    }, 800)
  }, [])

  function handleChange(value: string) {
    setText(value)
    if (activeId) {
      scheduleSave(activeId, value)
      setEntries(prev => prev.map(e =>
        e.id === activeId ? { ...e, preview: value.slice(0, 80).replace(/\n/g, ' ') } : e
      ))
    }
  }

  async function handleNew() {
    const id = await api.create()
    const newEntry: Entry = { id, created_at: new Date().toISOString(), preview: '' }
    setEntries(prev => [newEntry, ...prev])
    activeIdRef.current = id
    setActiveId(id)
    setText('')
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this entry?')) return
    await api.delete(id)
    setEntries(prev => prev.filter(en => en.id !== id))
    if (activeId === id) {
      const remaining = entries.filter(en => en.id !== id)
      if (remaining.length > 0) selectEntry(remaining[0].id)
      else { setActiveId(null); setText('') }
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && (
        <div className="w-[220px] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Freewrite</span>
            <button
              onClick={handleNew}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="New entry"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted-foreground">No entries yet. Create one above.</p>
            ) : (
              entries.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => selectEntry(entry.id)}
                  className={cn(
                    'group px-4 py-3 border-b border-border/50 cursor-pointer flex items-start gap-2 hover:bg-muted/30 transition-colors',
                    activeId === entry.id && 'bg-muted/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground mb-0.5">{fmtDate(entry.created_at)}</p>
                    <p className="text-xs text-foreground truncate leading-relaxed">
                      {entry.preview || <span className="text-muted-foreground italic">Empty</span>}
                    </p>
                  </div>
                  <button
                    onClick={e => handleDelete(entry.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all shrink-0 mt-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="absolute top-4 left-4 z-10 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {sidebarOpen ? '←' : '☰'}
        </button>
        {activeId ? (
          <textarea
            value={text}
            onChange={e => handleChange(e.target.value)}
            className="flex-1 w-full resize-none p-12 text-base leading-relaxed bg-background text-foreground placeholder:text-muted-foreground outline-none font-serif"
            placeholder="Start writing…"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-4">No entry selected.</p>
              <button
                onClick={handleNew}
                className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
              >
                New entry
              </button>
            </div>
          </div>
        )}
        {activeId && (
          <div className="absolute bottom-4 right-6 text-[10px] font-mono text-muted-foreground/40">
            {text.split(/\s+/).filter(Boolean).length} words
          </div>
        )}
      </div>
    </div>
  )
}
