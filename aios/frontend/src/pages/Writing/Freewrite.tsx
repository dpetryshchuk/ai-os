import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
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

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Freewrite() {
  const isMobile = useIsMobile()
  const [panel, setPanel] = useState<'list' | 'editor'>('list')
  const [entries, setEntries] = useState<Entry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
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
    if (isMobile) setPanel('editor')
  }, [isMobile])

  const scheduleSave = useCallback((id: string, value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      api.save(id, value).catch(() => {})
    }, 800)
  }, [])

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        if (activeIdRef.current && textareaRef.current) {
          api.save(activeIdRef.current, textareaRef.current.value).catch(() => {})
        }
      }
    }
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
    if (isMobile) setPanel('editor')
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this entry?')) return
    await api.delete(id)
    const remaining = entries.filter(en => en.id !== id)
    setEntries(remaining)
    if (activeId === id) {
      if (remaining.length > 0) selectEntry(remaining[0].id)
      else { setActiveId(null); setText(''); if (isMobile) setPanel('list') }
    }
  }

  const listPanel = (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Freewrite</span>
        <button
          onClick={handleNew}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="New entry"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-4 py-12">
            <p className="text-sm text-muted-foreground text-center">No entries yet.</p>
            <button
              onClick={handleNew}
              className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
            >
              New entry
            </button>
          </div>
        ) : (
          entries.map(entry => (
            <div
              key={entry.id}
              onClick={() => selectEntry(entry.id)}
              className={cn(
                'px-4 py-3 border-b border-border/50 cursor-pointer flex items-start gap-2 hover:bg-muted/30 transition-colors',
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
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors shrink-0 mt-0.5"
                title="Delete entry"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const editorPanel = (
    <div className="h-full flex flex-col overflow-hidden">
      {isMobile && (
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
          <button
            onClick={() => setPanel('list')}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {activeId ? fmtDate(entries.find(e => e.id === activeId)?.created_at ?? '') : 'Freewrite'}
          </span>
        </div>
      )}
      {activeId ? (
        <div className="flex-1 relative overflow-hidden">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => handleChange(e.target.value)}
            className={cn(
              'absolute inset-0 w-full h-full resize-none bg-background text-foreground placeholder:text-muted-foreground outline-none font-serif text-base leading-relaxed',
              isMobile ? 'p-5' : 'p-12'
            )}
            placeholder="Start writing…"
          />
          <div className="absolute bottom-4 right-6 text-[10px] font-mono text-muted-foreground/40 pointer-events-none">
            {text.split(/\s+/).filter(Boolean).length} words
          </div>
        </div>
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
    </div>
  )

  if (isMobile) {
    return (
      <div className="h-full overflow-hidden">
        {panel === 'list' ? listPanel : editorPanel}
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[220px] shrink-0 border-r border-border">
        {listPanel}
      </div>
      <div className="flex-1">
        {editorPanel}
      </div>
    </div>
  )
}
