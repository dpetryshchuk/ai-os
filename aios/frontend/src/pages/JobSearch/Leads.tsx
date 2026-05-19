import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'

interface Lead {
  id: string
  title: string
  company_name: string | null
  source: string
  link: string | null
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jobsearch/leads')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setLeads(d.leads ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background z-10 px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold">New Leads</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {!loading && !error && `${leads.length} new`}
        </span>
      </div>

      {loading && <p className="px-4 py-6 text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="px-4 py-6 text-sm text-destructive">Error: {error}</p>}

      {!loading && !error && (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {leads.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No new leads. Run the scrapers to pull fresh postings.
              </p>
            ) : leads.map(lead => (
              <div key={lead.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-medium leading-snug">{lead.title}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {lead.company_name && <span>{lead.company_name}</span>}
                    <span className={lead.company_name ? 'before:content-["·"] before:mr-2' : ''}>{lead.source}</span>
                  </div>
                </div>
                {lead.link && (
                  <a href={lead.link} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block px-6 py-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Role', 'Company', 'Source', ''].map(h => (
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
                      <td className="py-2.5 px-3 text-muted-foreground">{lead.company_name ?? '—'}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{lead.source}</td>
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
                      <td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
                        No new leads. Run the scrapers to pull fresh postings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
