import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, RefreshCw, MapPin, Briefcase } from 'lucide-react'

interface Lead {
  id: string
  title: string
  company_name: string | null
  website: string | null
  source: string | null
  location: string | null
  scraped_at: string | null
  link: string | null
}

const SOURCES = ['All', 'Indeed', 'LinkedIn', 'YC', 'Other']

function isNew(scraped_at: string | null): boolean {
  if (!scraped_at) return false
  return Date.now() - new Date(scraped_at).getTime() < 24 * 60 * 60 * 1000
}

function shortLocation(loc: string | null): string {
  if (!loc) return ''
  return loc.replace(/, US$/, '').replace(/, United States$/, '')
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState('All')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/jobsearch/leads')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setLeads(d.leads ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const triggerScrape = async () => {
    setScraping(true)
    try {
      const r = await fetch('/api/jobsearch/trigger/scrape.sd', { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setTimeout(load, 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTimeout(() => setScraping(false), 3000)
    }
  }

  const filtered = leads.filter(l => {
    if (sourceFilter === 'All') return true
    if (sourceFilter === 'Other') return !['Indeed', 'LinkedIn', 'YC'].includes(l.source ?? '')
    return l.source === sourceFilter
  })

  const newCount = leads.filter(l => isNew(l.scraped_at)).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">Leads</h1>
            {newCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold tabular-nums">
                {newCount} new
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${leads.length} open`}
          </p>
        </div>

        <button
          onClick={triggerScrape}
          disabled={scraping}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
            bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={scraping ? 'animate-spin' : ''} />
          {scraping ? 'Scraping…' : 'Scrape SD'}
        </button>
      </div>

      {/* Source filter pills */}
      <div className="shrink-0 px-4 py-2 flex gap-1.5 border-b border-border overflow-x-auto">
        {SOURCES.map(s => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              sourceFilter === s
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
            <Briefcase size={28} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No leads yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Click "Scrape SD" to pull today's SD-area postings from Indeed and LinkedIn.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map(lead => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col />{/* Role — takes remaining space */}
                  <col className="w-36" />{/* Company */}
                  <col className="w-28" />{/* Location */}
                  <col className="w-20" />{/* Source */}
                  <col className="w-10" />{/* Link */}
                </colgroup>
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b border-border">
                    {['Role', 'Company', 'Location', 'Source', ''].map(h => (
                      <th key={h} className="text-left py-2 px-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => (
                    <tr key={lead.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors group">
                      <td className="py-2.5 px-4 font-medium">
                        <div className="flex items-center gap-2 min-w-0">
                          {isNew(lead.scraped_at) && (
                            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" title="Added today" />
                          )}
                          <span className="truncate">{lead.title}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground truncate">
                        {lead.company_name ?? '—'}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs truncate">
                        {shortLocation(lead.location) || '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <SourceBadge source={lead.source} />
                      </td>
                      <td className="py-2.5 px-4">
                        {lead.link && (
                          <a href={lead.link} target="_blank" rel="noopener noreferrer"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground inline-flex">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      {isNew(lead.scraped_at) && (
        <div className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-snug truncate">{lead.title}</div>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
          {lead.company_name && (
            <span className="text-xs text-muted-foreground">{lead.company_name}</span>
          )}
          {lead.location && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <MapPin size={10} />
              {shortLocation(lead.location)}
            </span>
          )}
          {lead.source && <SourceBadge source={lead.source} />}
        </div>
      </div>
      {lead.link && (
        <a href={lead.link} target="_blank" rel="noopener noreferrer"
          className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  )
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null
  const colors: Record<string, string> = {
    Indeed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    LinkedIn: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    YC: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  }
  const cls = colors[source] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {source}
    </span>
  )
}
