import { KeyboardEvent, useEffect, useRef, useState } from 'react'

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

const CAT: Record<Category, { label: string; color: string; glyph: string }> = {
  idea:   { label: 'IDEA',   color: '#f59e0b', glyph: '◆' },
  fix:    { label: 'FIX',    color: '#ef4444', glyph: '◈' },
  todo:   { label: 'TODO',   color: '#3b82f6', glyph: '◉' },
  vision: { label: 'VISION', color: '#a78bfa', glyph: '◇' },
}

const STATUS_DOT: Record<Status, string> = {
  open:        '#3a3a3a',
  in_progress: '#f59e0b',
  done:        '#22c55e',
}

const STATUS_CYCLE: Status[] = ['open', 'in_progress', 'done']

function cycleStatus(s: Status): Status {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length]
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const MONO = "'JetBrains Mono', monospace"

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [input, setInput] = useState('')
  const [category, setCategory] = useState<Category>('idea')
  const [priority, setPriority] = useState<Priority>('normal')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const d = await fetch('/api/ideas/').then(r => r.json())
    setIdeas(d.ideas ?? [])
  }

  async function capture() {
    if (!input.trim() || saving) return
    setSaving(true)
    await fetch('/api/ideas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.trim(), category, priority }),
    })
    setInput('')
    setSaving(false)
    load()
    inputRef.current?.focus()
  }

  async function patch(id: string, body: Partial<Idea>) {
    await fetch(`/api/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/ideas/${id}`, { method: 'DELETE' })
    setExpanded(null)
    load()
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      capture()
    }
  }

  const filtered = ideas.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (catFilter !== 'all' && i.category !== catFilter) return false
    return true
  })

  const openCount = ideas.filter(i => i.status === 'open').length
  const doneCount = ideas.filter(i => i.status === 'done').length

  return (
    <div
      style={{ fontFamily: MONO, backgroundColor: '#0a0a0a', color: '#d4d4d4' }}
      className="flex flex-col min-h-full"
    >
      {/* ── Capture zone ──────────────────────────────────── */}
      <div style={{ backgroundColor: '#0f0f0f', borderBottom: '1px solid #1c1c1c' }} className="px-4 pt-4 pb-3 flex flex-col gap-3">
        {/* Top line */}
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 10, letterSpacing: '0.2em', color: '#3a3a3a' }}>
            AI OS · IDEAS
          </span>
          <span style={{ fontSize: 10, color: '#3a3a3a' }}>
            {openCount} open · {doneCount} done
          </span>
        </div>

        {/* Input */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="capture a thought..."
          rows={2}
          style={{
            fontFamily: MONO,
            backgroundColor: 'transparent',
            color: '#e8e8e8',
            fontSize: 14,
            lineHeight: 1.6,
            resize: 'none',
            outline: 'none',
            border: 'none',
            width: '100%',
          }}
        />

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category buttons */}
          <div className="flex gap-1">
            {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, c]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.15em',
                  padding: '2px 7px',
                  borderRadius: 2,
                  border: `1px solid ${c.color}`,
                  color: category === key ? '#0a0a0a' : c.color,
                  backgroundColor: category === key ? c.color : 'transparent',
                  opacity: category === key ? 1 : 0.45,
                  transition: 'all 0.1s',
                  cursor: 'pointer',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Priority */}
          <div className="flex gap-1 ml-auto">
            {(['low', 'normal', 'high'] as Priority[]).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 2,
                  border: '1px solid #222',
                  color: priority === p ? '#e8e8e8' : '#3a3a3a',
                  backgroundColor: priority === p ? '#1e1e1e' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
                title={p}
              >
                {p === 'low' ? '↓' : p === 'normal' ? '·' : '↑'}
              </button>
            ))}
          </div>

          {/* Save */}
          <button
            onClick={capture}
            disabled={!input.trim() || saving}
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.15em',
              padding: '3px 10px',
              borderRadius: 2,
              border: 'none',
              color: '#0a0a0a',
              backgroundColor: input.trim() ? CAT[category].color : '#222',
              cursor: input.trim() ? 'pointer' : 'default',
              opacity: saving ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
          >
            {saving ? '...' : '⌘↵ SAVE'}
          </button>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────── */}
      <div
        style={{ borderBottom: '1px solid #161616', overflowX: 'auto' }}
        className="flex gap-4 px-4 py-2 shrink-0"
      >
        {(['all', 'open', 'in_progress', 'done'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.15em',
              whiteSpace: 'nowrap',
              color: statusFilter === s ? '#e8e8e8' : '#363636',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'color 0.1s',
            }}
          >
            {s === 'in_progress' ? 'IN PROGRESS' : s.toUpperCase()}
          </button>
        ))}
        <span style={{ color: '#1e1e1e', userSelect: 'none' }}>|</span>
        {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, c]) => (
          <button
            key={key}
            onClick={() => setCatFilter(catFilter === key ? 'all' : key)}
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.12em',
              whiteSpace: 'nowrap',
              color: catFilter === key ? c.color : '#363636',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'color 0.1s',
            }}
          >
            {c.glyph} {c.label}
          </button>
        ))}
      </div>

      {/* ── List ─────────────────────────────────────────── */}
      <div className="flex-1">
        {filtered.length === 0 && (
          <div style={{ color: '#2a2a2a', fontSize: 11, letterSpacing: '0.1em' }} className="py-16 text-center">
            NOTHING HERE
          </div>
        )}
        {filtered.map(idea => {
          const cat = CAT[idea.category]
          const isOpen = expanded === idea.id
          const isEditing = editing?.id === idea.id
          const isDone = idea.status === 'done'

          return (
            <div
              key={idea.id}
              onClick={() => !isEditing && setExpanded(isOpen ? null : idea.id)}
              style={{
                borderBottom: '1px solid #141414',
                borderLeft: `2px solid ${isOpen ? cat.color : 'transparent'}`,
                backgroundColor: isOpen ? '#0d0d0d' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.1s',
                padding: '12px 16px',
              }}
            >
              <div className="flex items-start gap-3">
                {/* Glyph */}
                <span style={{ color: cat.color, fontSize: 12, marginTop: 1, flexShrink: 0, userSelect: 'none' }}>
                  {cat.glyph}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={editing.content}
                      onChange={e => setEditing({ ...editing, content: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          patch(idea.id, { content: editing.content })
                          setEditing(null)
                        }
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      rows={3}
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        lineHeight: 1.6,
                        width: '100%',
                        backgroundColor: '#1a1a1a',
                        color: '#e8e8e8',
                        border: '1px solid #2a2a2a',
                        borderRadius: 3,
                        padding: '6px 8px',
                        outline: 'none',
                        resize: 'none',
                      }}
                    />
                  ) : (
                    <p
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: isDone ? '#383838' : '#d4d4d4',
                        textDecoration: isDone ? 'line-through' : 'none',
                        margin: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: isOpen ? undefined : 2,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: isOpen ? 'visible' : 'hidden',
                      }}
                    >
                      {idea.content}
                    </p>
                  )}

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 10, color: '#303030', alignItems: 'center' }}>
                    <span>{fmt(idea.created_at)}</span>
                    {idea.priority === 'high' && <span style={{ color: '#7a2020' }}>↑ high</span>}
                    {idea.priority === 'low'  && <span style={{ color: '#2a3a2a' }}>↓ low</span>}
                    {isOpen && !isEditing && (
                      <div style={{ display: 'flex', gap: 10, marginLeft: 4 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setEditing({ id: idea.id, content: idea.content })}
                          style={{ fontFamily: MONO, fontSize: 10, color: '#404040', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseOver={e => (e.currentTarget.style.color = '#e8e8e8')}
                          onMouseOut={e => (e.currentTarget.style.color = '#404040')}
                        >
                          edit
                        </button>
                        <button
                          onClick={() => remove(idea.id)}
                          style={{ fontFamily: MONO, fontSize: 10, color: '#404040', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseOut={e => (e.currentTarget.style.color = '#404040')}
                        >
                          del
                        </button>
                        {/* Category switcher */}
                        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                          {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, c]) => (
                            <button
                              key={key}
                              onClick={() => patch(idea.id, { category: key })}
                              style={{
                                fontFamily: MONO,
                                fontSize: 9,
                                padding: '1px 5px',
                                borderRadius: 2,
                                border: `1px solid ${c.color}`,
                                color: idea.category === key ? '#0a0a0a' : c.color,
                                backgroundColor: idea.category === key ? c.color : 'transparent',
                                opacity: idea.category === key ? 1 : 0.35,
                                cursor: 'pointer',
                                background: 'none',
                              }}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status dot — click to cycle */}
                <button
                  onClick={e => { e.stopPropagation(); patch(idea.id, { status: cycleStatus(idea.status) }) }}
                  title={`${idea.status} → click to advance`}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: STATUS_DOT[idea.status],
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginTop: 6,
                    boxShadow: idea.status === 'in_progress' ? `0 0 8px ${STATUS_DOT[idea.status]}` : 'none',
                    transition: 'all 0.2s',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
