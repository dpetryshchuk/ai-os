import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Category = 'idea' | 'fix' | 'todo' | 'vision'
type Status = 'open' | 'in_progress' | 'done'
type Priority = 'low' | 'normal' | 'high'

interface Idea {
  id: string
  content: string
  category: Category
  status: Status
  priority: Priority
  created_at: string
  updated_at: string
}

const CATEGORIES: Category[] = ['idea', 'fix', 'todo', 'vision']
const STATUSES: Status[] = ['open', 'in_progress', 'done']

const CAT_LABEL: Record<Category, string> = {
  idea: 'Idea', fix: 'Fix', todo: 'Todo', vision: 'Vision',
}

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open', in_progress: 'In Progress', done: 'Done',
}

const STATUS_CYCLE: Status[] = ['open', 'in_progress', 'done']

function cycleStatus(s: Status): Status {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length]
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={cn(
      'text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0',
      category === 'fix'    && 'border-red-500/30 text-red-400',
      category === 'todo'   && 'border-blue-500/30 text-blue-400',
      category === 'vision' && 'border-violet-500/30 text-violet-400',
      category === 'idea'   && 'border-border text-muted-foreground',
    )}>
      {CAT_LABEL[category]}
    </span>
  )
}

function StatusBadge({ status, onClick }: { status: Status; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title="Click to advance status"
      className={cn(
        'text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border transition-colors',
        status === 'open'        && 'border-border text-muted-foreground hover:border-foreground/30',
        status === 'in_progress' && 'border-amber-500/40 text-amber-500 hover:border-amber-500/70',
        status === 'done'        && 'border-emerald-500/40 text-emerald-500 hover:border-emerald-500/70',
      )}
    >
      {status === 'in_progress' ? 'In Progress' : STATUS_LABEL[status]}
    </button>
  )
}

function IdeaRow({ idea, onUpdate, onDelete }: {
  idea: Idea
  onUpdate: () => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eContent, setEContent] = useState(idea.content)
  const [eCategory, setECategory] = useState<Category>(idea.category)
  const [ePriority, setEPriority] = useState<Priority>(idea.priority)

  async function patch(body: Partial<Idea>) {
    await fetch(`/api/ideas/${idea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    onUpdate()
  }

  async function saveEdit() {
    setSaving(true)
    try {
      await patch({ content: eContent.trim(), category: eCategory, priority: ePriority })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this idea?')) return
    await fetch(`/api/ideas/${idea.id}`, { method: 'DELETE' })
    onDelete(idea.id)
  }

  if (editing) {
    return (
      <div className="border-b border-border bg-muted/10 px-4 py-4 flex flex-col gap-3">
        <textarea
          autoFocus
          value={eContent}
          onChange={e => setEContent(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit() }
            if (e.key === 'Escape') setEditing(false)
          }}
          rows={3}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring/30 resize-none"
        />
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setECategory(cat)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md border transition-colors',
                  eCategory === cat
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {CAT_LABEL[cat]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 ml-auto">
            {(['low', 'normal', 'high'] as Priority[]).map(p => (
              <button
                key={p}
                onClick={() => setEPriority(p)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md border transition-colors',
                  ePriority === p
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveEdit}
            disabled={saving || !eContent.trim()}
            className="px-4 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  const isLong = idea.content.length > 120

  return (
    <div className="group border-b border-border/50 hover:bg-muted/20 transition-colors">
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Content + meta */}
        <button
          onClick={() => isLong && setExpanded(v => !v)}
          className={cn('flex-1 min-w-0 flex flex-col gap-1.5 text-left', !isLong && 'cursor-default')}
        >
          <p className={cn(
            'text-sm leading-relaxed',
            idea.status === 'done' && 'line-through text-muted-foreground',
            !expanded && isLong && 'line-clamp-2',
          )}>
            {idea.content}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={idea.category} />
            {idea.priority !== 'normal' && (
              <span className={cn(
                'text-[9px] font-mono uppercase tracking-widest',
                idea.priority === 'high' ? 'text-red-400' : 'text-muted-foreground/50',
              )}>
                {idea.priority === 'high' ? '↑ high' : '↓ low'}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{fmtDate(idea.created_at)}</span>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <StatusBadge
            status={idea.status}
            onClick={e => { e.stopPropagation(); patch({ status: cycleStatus(idea.status) }) }}
          />
          <button
            onClick={e => { e.stopPropagation(); setEContent(idea.content); setECategory(idea.category); setEPriority(idea.priority); setEditing(true); setExpanded(false) }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
          >
            <Trash2 size={12} />
          </button>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)}>
              <ChevronDown size={13} className={cn('text-muted-foreground transition-transform', expanded && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [category, setCategory] = useState<Category>('idea')
  const [priority, setPriority] = useState<Priority>('normal')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const d = await fetch('/api/ideas/').then(r => r.json())
    setIdeas(d.ideas ?? [])
    setLoading(false)
  }

  async function save() {
    if (!input.trim() || saving) return
    setSaving(true)
    await fetch('/api/ideas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.trim(), category, priority }),
    })
    setInput('')
    setSaving(false)
    setShowAdd(false)
    load()
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
    if (e.key === 'Escape') { setShowAdd(false); setInput('') }
  }

  const filtered = ideas.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (catFilter !== 'all' && i.category !== catFilter) return false
    return true
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 px-4 py-3 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-medium">Ideas</h1>
        <button
          onClick={() => { setShowAdd(v => !v); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1.5 hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          {showAdd ? <><X size={12} /> Cancel</> : <><Plus size={12} /> Add</>}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="border-b border-border bg-muted/10 px-4 py-4 flex flex-col gap-3 shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="What's on your mind? (⌘↵ to save)"
            rows={3}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring/30 resize-none"
          />
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md border transition-colors',
                    category === cat
                      ? 'border-foreground text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {CAT_LABEL[cat]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 ml-auto">
              {(['low', 'normal', 'high'] as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md border transition-colors',
                    priority === p
                      ? 'border-foreground text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving || !input.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0 flex-wrap">
        {(['all', ...STATUSES] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors',
              statusFilter === s
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : STATUS_LABEL[s]}
          </button>
        ))}
        <span className="text-muted-foreground/30 mx-1 select-none">·</span>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? 'all' : cat)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors',
              catFilter === cat
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {CAT_LABEL[cat]}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground font-mono">{filtered.length}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {ideas.length === 0 ? 'No ideas yet. Hit Add to capture one.' : 'No matches.'}
            </p>
          </div>
        )}
        {filtered.map(idea => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            onUpdate={load}
            onDelete={id => setIdeas(prev => prev.filter(i => i.id !== id))}
          />
        ))}
      </div>
    </div>
  )
}
