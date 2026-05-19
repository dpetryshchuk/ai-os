import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, Clock, Zap, AlertCircle } from 'lucide-react'
import { useAgentRefresh } from '@/hooks/useAgentRefresh'

interface FunnelStage {
  stage: string
  count: number
  pct_of_prev: number | null
}

interface RetroFunnel {
  stages: FunnelStage[]
  avg_days_to_response: number | null
  interactions_this_week: number
  interactions_today: number
}

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
  funnel: RetroFunnel | null
}

// Nick Saraev outreach benchmarks: reply rate ~15%, reply → meeting ~40%
const BENCHMARKS: Record<string, number> = {
  Responded: 15,
  'In conversation': 40,
}

function relativeDate(s: string): string {
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function CalendarRow({ daily }: { daily: { date: string; count: number }[] }) {
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
  const DAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div className="flex gap-1.5">
      {days.map((d, i) => {
        const s = d.toISOString().slice(0, 10)
        const n = countMap[s] ?? 0
        const isToday = s === todayStr
        const future = s > todayStr
        return (
          <div key={s} className={cn(
            'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border text-center',
            isToday ? 'border-foreground bg-foreground/5' : 'border-border',
          )}>
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{DAY[i]}</span>
            <span className={cn('text-sm font-semibold tabular-nums',
              future ? 'text-muted-foreground/20' : n > 0 ? 'text-foreground' : 'text-muted-foreground/30'
            )}>
              {future ? '—' : n > 0 ? n : '·'}
            </span>
            <span className="text-[9px] text-muted-foreground/60 font-mono">{d.getDate()}</span>
          </div>
        )
      })}
    </div>
  )
}

function FunnelBar({ stage, total }: { stage: FunnelStage; total: number }) {
  const benchmark = BENCHMARKS[stage.stage]
  const pct = stage.pct_of_prev
  const above = pct !== null && benchmark !== undefined && pct >= benchmark
  const below = pct !== null && benchmark !== undefined && pct < benchmark
  const barWidth = total > 0 ? Math.round((stage.count / total) * 100) : 0

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="w-36 shrink-0">
        <p className="text-sm font-medium">{stage.stage}</p>
        {pct !== null && benchmark !== undefined && (
          <p className={cn('text-[10px] mt-0.5', above ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
            {pct}% · target {benchmark}%
          </p>
        )}
      </div>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', above ? 'bg-emerald-500' : below ? 'bg-amber-500' : 'bg-foreground/30')}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className="w-8 text-right text-lg font-semibold tabular-nums shrink-0">{stage.count}</span>
    </div>
  )
}

function WeekSparkline({ weekly }: { weekly: { week: string; count: number }[] }) {
  if (weekly.length === 0) return null
  const max = Math.max(...weekly.map(w => w.count), 1)
  const recent = weekly.slice(-10)
  return (
    <div className="flex items-end gap-0.5 h-10">
      {recent.map(w => (
        <div
          key={w.week}
          className="flex-1 bg-foreground/20 rounded-sm min-h-[2px] hover:bg-foreground/40 transition-colors"
          style={{ height: `${Math.max(Math.round((w.count / max) * 100), 4)}%` }}
          title={`Week of ${new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${w.count}`}
        />
      ))}
    </div>
  )
}

export default function Retro() {
  const [data, setData] = useState<RetroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/jobsearch/retro')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useAgentRefresh(load)

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-sm text-destructive">Error: {error}</div>
  if (!data) return null

  const { stats, weekly, daily, by_source, needs_action, funnel } = data

  return (
    <div className="overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-7">

        {/* Activity */}
        <section>
          <SectionLabel>This week</SectionLabel>
          <CalendarRow daily={daily} />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Tile icon={<Zap size={13} />} label="Today" value={funnel?.interactions_today ?? 0} sub="interactions" />
            <Tile icon={<TrendingUp size={13} />} label="This week" value={funnel?.interactions_this_week ?? 0} sub="interactions" />
          </div>
        </section>

        {/* Conversion funnel */}
        {funnel && funnel.stages.length > 0 && (
          <section>
            <SectionLabel>Conversion funnel</SectionLabel>

            <div className="border border-border rounded-lg px-4 py-1">
              {funnel.stages.map(s => <FunnelBar key={s.stage} stage={s} total={funnel.stages[0]?.count ?? 0} />)}
            </div>
            {funnel.avg_days_to_response !== null && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-2">
                <Clock size={11} />
                Avg {funnel.avg_days_to_response.toFixed(1)}d from outreach to first reply
              </p>
            )}
          </section>
        )}

        {/* CRM totals */}
        <section>
          <SectionLabel>Overview</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Contacts" value={stats.total_contacts} />
            <Tile label="Active" value={stats.active_contacts} />
            <Tile label="All interactions" value={stats.total_interactions} />
            <Tile label="Applications" value={stats.total_applications} />
          </div>
        </section>

        {/* Needs follow-up */}
        {needs_action.length > 0 && (
          <section>
            <SectionLabel>
              <span className="flex items-center gap-1.5">
                <AlertCircle size={11} />
                Follow up ({needs_action.length})
              </span>
            </SectionLabel>
            <div className="flex flex-col gap-1.5">
              {needs_action.map(item => (
                <div key={item.id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
                  <StagePill stage={item.stage} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{item.name}</span>
                    {item.company_name && <span className="text-xs text-muted-foreground">{item.company_name}</span>}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {item.last_contact ? relativeDate(item.last_contact) : 'never'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Volume trend */}
        {weekly.length > 0 && (
          <section>
            <SectionLabel>Weekly trend</SectionLabel>
            <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
              <WeekSparkline weekly={weekly} />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{weekly.length} weeks tracked</span>
                <span>peak {Math.max(...weekly.map(w => w.count))} / week</span>
              </div>
            </div>
          </section>
        )}

        {/* By source */}
        {by_source.length > 0 && (
          <section>
            <SectionLabel>By source</SectionLabel>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['Source', 'Total', 'Active', 'Keep rate'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...by_source].sort((a, b) => b.total - a.total).map(s => {
                    const rate = s.total > 0 ? Math.round(s.active / s.total * 100) : null
                    return (
                      <tr key={s.source} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{s.source ?? 'Unknown'}</td>
                        <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{s.total}</td>
                        <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{s.active}</td>
                        <td className="py-2.5 px-3">
                          {rate !== null && (
                            <span className={cn('text-xs font-medium', rate >= 30 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                              {rate}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground pb-2 border-b border-border mb-3">
      {children}
    </p>
  )
}

function Tile({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
      <p className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {icon}{label}
      </p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function StagePill({ stage }: { stage: string }) {
  const cls =
    stage === 'Ongoing' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
    stage === 'Responded' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
    'bg-muted text-muted-foreground'
  return (
    <span className={cn('shrink-0 text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded', cls)}>
      {stage}
    </span>
  )
}
