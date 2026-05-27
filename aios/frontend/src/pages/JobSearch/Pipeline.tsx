import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentRefresh } from '@/hooks/useAgentRefresh'
import { StatusPicker } from './StatusPicker'

type Stage = 'Outreached' | 'Responded' | 'Ongoing' | 'Dead'
const STAGES: readonly Stage[] = ['Outreached', 'Responded', 'Ongoing', 'Dead'] as const

interface Contact {
  id: string
  name: string
  role: string | null
  company_name: string | null
  source: string
  stage: Stage
  last_contact: string | null
}

const STAGE_STYLES: Partial<Record<Stage, string>> = {
  Ongoing: 'text-emerald-600 dark:text-emerald-400',
  Responded: 'text-amber-600 dark:text-amber-400',
  Outreached: 'text-muted-foreground',
  Dead: 'text-muted-foreground/40',
}

function relativeDate(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function Pipeline() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDead, setShowDead] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/jobsearch/pipeline')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setContacts(d.contacts ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useAgentRefresh(load)

  const updateStage = async (id: string, stage: Stage) => {
    const prev = contacts
    setContacts(cs => cs.map(c => c.id === id ? { ...c, stage } : c))
    try {
      const r = await fetch(`/api/jobsearch/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    } catch (e: any) {
      setContacts(prev)
      setError(e.message)
    }
  }

  const { active, dead } = useMemo(() => ({
    active: contacts.filter(c => c.stage !== 'Dead'),
    dead: contacts.filter(c => c.stage === 'Dead'),
  }), [contacts])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background z-10 p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold">Pipeline</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {!loading && !error && `${active.length} active${dead.length ? ` · ${dead.length} dead` : ''}`}
        </span>
      </div>

      {loading && <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="px-4 py-6 text-sm text-destructive">Error: {error}</p>}

      {!loading && !error && (
        <>
          <ContactsView contacts={active} updateStage={updateStage} emptyHint="No active contacts." />

          {dead.length > 0 && (
            <div className="px-4 md:px-6 py-3 border-t border-border/60">
              <button
                onClick={() => setShowDead(s => !s)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDead ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Show dead ({dead.length})
              </button>
            </div>
          )}

          {showDead && dead.length > 0 && (
            <ContactsView contacts={dead} updateStage={updateStage} emptyHint="" muted />
          )}
        </>
      )}
    </div>
  )
}

interface ContactsViewProps {
  contacts: Contact[]
  updateStage: (id: string, stage: Stage) => void
  emptyHint: string
  muted?: boolean
}

function ContactsView({ contacts, updateStage, emptyHint, muted }: ContactsViewProps) {
  if (contacts.length === 0) {
    if (!emptyHint) return null
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyHint}</p>
  }

  return (
    <div className={cn(muted && 'opacity-70')}>
      {/* Mobile */}
      <div className="md:hidden flex flex-col divide-y divide-border">
        {contacts.map(c => (
          <div key={c.id} className="px-4 py-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.name}</span>
              <StatusPicker
                value={c.stage}
                options={STAGES}
                onChange={s => updateStage(c.id, s)}
                styles={STAGE_STYLES}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {c.company_name && <span>{c.company_name}</span>}
              {c.role && <span className="before:content-['·'] before:mr-2">{c.role}</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <span>{c.source}</span>
              {c.last_contact && <span className="before:content-['·'] before:mr-2">{relativeDate(c.last_contact)}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block px-6 py-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Name', 'Company', 'Role', 'Source', 'Stage', 'Last contact'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 font-medium">{c.name}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{c.company_name ?? '—'}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{c.role ?? '—'}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{c.source}</td>
                  <td className="py-2.5 px-3">
                    <StatusPicker
                      value={c.stage}
                      options={STAGES}
                      onChange={s => updateStage(c.id, s)}
                      styles={STAGE_STYLES}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">
                    {c.last_contact ? relativeDate(c.last_contact) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
