import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'

const BASE = window.location.hostname === 'localhost' ? 'http://localhost:4111' : ''

interface Lead {
  id: string
  title: string
  company: string | null
  source: string
  link: string | null
  scraped_date: string
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(BASE + '/data/leads')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setLeads)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background z-10 px-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold">New Leads</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {!loading && !error && `${leads.length} new`}
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
                  {['Role', 'Company', 'Source', 'Date', ''].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-medium">{lead.title}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{lead.company ?? '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{lead.source}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{fmtDate(lead.scraped_date)}</td>
                    <td className="py-2.5 px-3">
                      {lead.link && (
                        <a href={lead.link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                      No new leads. Run the scrapers to pull fresh postings.
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
