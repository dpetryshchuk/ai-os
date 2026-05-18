import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface RetroData {
  weekly: { week: string; count: number }[]
  daily: { date: string; count: number }[]
  by_source: { source: string; total: number; active: number }[]
  needs_action: { id: string; name: string; stage: string; company_name: string | null; last_contact: string | null }[]
  stats: {
    total_contacts: number
    active_contacts: number
    total_interactions: number
    total_applications: number
  }
}

const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function CalendarStrip({ daily }: { daily: { date: string; count: number }[] }) {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const countMap: Record<string, number> = {}
  daily.forEach(r => { countMap[r.date] = r.count })

  const todayStr = today.toISOString().slice(0, 10)

  return (
    <div className="flex gap-1.5 mb-6">
      {days.map((d, i) => {
        const dateStr = d.toISOString().slice(0, 10)
        const count = countMap[dateStr] ?? 0
        const isToday = dateStr === todayStr
        const isFuture = dateStr > todayStr
        return (
          <div key={dateStr} className={cn(
            'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border text-center',
            isToday ? 'border-foreground bg-foreground/5' : 'border-border',
          )}>
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{DAY_NAMES[i]}</span>
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              isFuture ? 'text-muted-foreground/20' : count > 0 ? 'text-foreground' : 'text-muted-foreground/30'
            )}>
              {isFuture ? '—' : count > 0 ? count : '·'}
            </span>
            <span className="text-[9px] text-muted-foreground/60 font-mono">{d.getDate()}</span>
          </div>
        )
      })}
    </div>
  )
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeDate(s: string): string {
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function Retro() {
  const [data, setData] = useState<RetroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jobsearch/retro')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (error) return <div className="p-6 text-sm text-destructive">Error: {error}</div>
  if (!data) return null

  const { stats, weekly, daily, by_source, needs_action } = data
  const thisWeekCount = daily
    .filter(d => {
      const dayDate = new Date(d.date)
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1))
      return dayDate >= weekStart
    })
    .reduce((s, d) => s + d.count, 0)

  return (
    <div className="overflow-y-auto flex flex-col gap-8 px-6 py-6">
      {/* This week */}
      <section>
        <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-border">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">This week</h2>
          <span className="text-xs text-muted-foreground">
            {'Week of ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <CalendarStrip daily={daily} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="This week" value={thisWeekCount} sub="interactions" />
          <StatCard label="Active" value={stats.active_contacts} sub={`of ${stats.total_contacts} contacts`} />
          <StatCard label="All interactions" value={stats.total_interactions} sub="all time" />
          <StatCard label="Applications" value={stats.total_applications} sub="applied" />
        </div>
      </section>

      {/* Needs action */}
      {needs_action.length > 0 && (
        <section>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b border-border">
            Needs follow-up
          </p>
          <div className="flex flex-col gap-2 mb-6">
            {needs_action.map(item => (
              <div key={item.id} className="flex items-start gap-3 border border-border rounded-lg px-4 py-3">
                <span className={cn(
                  'mt-0.5 text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0',
                  item.stage === 'Ongoing' ? 'bg-emerald-500/10 text-emerald-600' :
                  item.stage === 'Responded' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
                )}>
                  {item.stage}
                </span>
                <div className="flex-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.company_name && <span className="text-xs text-muted-foreground ml-2">{item.company_name}</span>}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {item.last_contact ? relativeDate(item.last_contact) : 'never'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* By source */}
      {by_source.length > 0 && (
        <section>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b border-border">
            By source
          </p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Source', 'Total', 'Active'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {by_source.map(s => (
                  <tr key={s.source} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3">{s.source}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{s.total}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{s.active}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Week by week */}
      <section>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b border-border">
          Week by week
        </p>
        {weekly.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interactions logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Week of', 'Interactions'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...weekly].reverse().map(w => (
                  <tr key={w.week} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3">{fmtDate(w.week)}</td>
                    <td className="py-2.5 px-3">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
