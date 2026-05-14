import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const BASE = window.location.hostname === 'localhost' ? 'http://localhost:4111' : ''

interface RetroData {
  daily: { date: string; direction: string; n: string }[]
  stats: {
    sent_week: string
    received_week: string
    active: string
    total_contacts: string
  }
  bySource: { source: string; stage: string; n: string }[]
  alltime: {
    sent_total: string
    received_total: string
    contacts_total: string
    dead_total: string
    first_interaction: string | null
  }
  weekly: { week: string; direction: string; n: string }[]
  recentActivity: {
    date: string
    direction: string
    notes: string
    contact: string
    company: string | null
    stage: string
  }[]
}

const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function dayCellColor(isFuture: boolean, count: number): string {
  if (isFuture) return 'text-muted-foreground/20'
  if (count > 0) return 'text-foreground'
  return 'text-muted-foreground/30'
}

function dayCellLabel(isFuture: boolean, count: number): string | number {
  if (isFuture) return '—'
  if (count > 0) return count
  return '·'
}

function CalendarStrip({ daily }: { daily: { date: string; direction: string; n: string }[] }) {
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
  daily.forEach(r => {
    countMap[r.date] = (countMap[r.date] ?? 0) + parseInt(r.n)
  })

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
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              {DAY_NAMES[i]}
            </span>
            <span className={cn('text-sm font-semibold tabular-nums', dayCellColor(isFuture, count))}>
              {dayCellLabel(isFuture, count)}
            </span>
            <span className="text-[9px] text-muted-foreground/60 font-mono">{d.getDate()}</span>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round(num / den * 100) : 0
}

export default function Retro() {
  const [data, setData] = useState<RetroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(BASE + '/data/retro')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (error) return <div className="p-6 text-sm text-destructive">Error: {error}</div>
  if (!data) return null

  const sentWeek = parseInt(data.stats.sent_week) || 0
  const rcvdWeek = parseInt(data.stats.received_week) || 0
  const replyRate = pct(rcvdWeek, sentWeek)
  const sentTotal = parseInt(data.alltime.sent_total) || 0
  const rcvdTotal = parseInt(data.alltime.received_total) || 0
  const rateTotal = pct(rcvdTotal, sentTotal)

  const sourceMap: Record<string, Record<string, number>> = {}
  data.bySource.forEach(r => {
    if (!sourceMap[r.source]) sourceMap[r.source] = {}
    sourceMap[r.source][r.stage] = parseInt(r.n)
  })

  const weekMap: Record<string, { sent: number; received: number }> = {}
  data.weekly.forEach(r => {
    if (!weekMap[r.week]) weekMap[r.week] = { sent: 0, received: 0 }
    if (r.direction === 'out') weekMap[r.week].sent = parseInt(r.n)
    if (r.direction === 'in') weekMap[r.week].received = parseInt(r.n)
  })
  const weeks = Object.entries(weekMap).sort((a, b) => b[0].localeCompare(a[0]))

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
        <CalendarStrip daily={data.daily} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Sent out" value={sentWeek} sub="this week" />
          <StatCard label="Replies in" value={rcvdWeek} sub="this week" />
          <StatCard label="Reply rate" value={`${replyRate}%`} sub={sentWeek > 0 ? `${rcvdWeek} / ${sentWeek}` : 'no data'} />
          <StatCard label="Active" value={data.stats.active} sub={`of ${data.stats.total_contacts} contacts`} />
        </div>

        {data.recentActivity.length > 0 ? (
          <>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b border-border">
              Activity this week
            </p>
            <div className="flex flex-col gap-2 mb-6">
              {data.recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 border border-border rounded-lg px-4 py-3">
                  <span className={cn(
                    'mt-0.5 text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0',
                    item.direction === 'out'
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {item.direction === 'out' ? 'sent' : 'rcvd'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.contact}</span>
                      {item.company && (
                        <span className="text-xs text-muted-foreground">{item.company}</span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.notes}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 mt-0.5">
                    {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mb-6">No activity in the last 7 days.</p>
        )}

      </section>

      {/* All time */}
      <section>
        <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-border">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">All time</h2>
          {data.alltime.first_interaction && (
            <span className="text-xs text-muted-foreground">Since {fmtDate(data.alltime.first_interaction)}</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Sent total" value={sentTotal} sub="all time" />
          <StatCard label="Replies total" value={rcvdTotal} sub="all time" />
          <StatCard label="Reply rate" value={`${rateTotal}%`} sub={sentTotal > 0 ? `${rcvdTotal} / ${sentTotal}` : 'no data'} />
          <StatCard label="Contacts" value={data.alltime.contacts_total} sub={`${data.alltime.dead_total} dead`} />
        </div>

        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b border-border">
          Week by week
        </p>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interactions logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Week of', 'Sent', 'Received', 'Rate'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map(([week, { sent, received }]) => {
                  const rate = sent > 0 ? `${pct(received, sent)}%` : '—'
                  return (
                    <tr key={week} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">{fmtDate(week)}</td>
                      <td className="py-2.5 px-3">{sent}</td>
                      <td className="py-2.5 px-3">{received}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{rate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
