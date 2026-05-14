import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const BASE = window.location.hostname === 'localhost' ? 'http://localhost:4111' : ''

interface Contact {
  id: string
  name: string
  role: string | null
  company: string | null
  source: string
  stage: string
  last_contact: string | null
}

const STAGE_STYLES: Record<string, string> = {
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

  useEffect(() => {
    fetch(BASE + '/data/pipeline')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setContacts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background z-10 px-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold">Pipeline</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {!loading && !error && `${contacts.length} contacts`}
        </span>
      </div>

      <div className="px-6 py-4">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {error && <p className="text-sm text-destructive">Error: {error}</p>}
        {!loading && !error && (
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
                    <td className="py-2.5 px-3 text-muted-foreground">{c.company ?? '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.role ?? '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.source}</td>
                    <td className="py-2.5 px-3">
                      <span className={cn('text-[11px] font-mono font-medium', STAGE_STYLES[c.stage] ?? 'text-muted-foreground')}>
                        {c.stage}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">
                      {c.last_contact ? relativeDate(c.last_contact) : '—'}
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                      No contacts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
