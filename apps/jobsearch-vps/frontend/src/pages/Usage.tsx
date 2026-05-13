import { useState, useEffect } from 'react'

const BASE = window.location.hostname === 'localhost' ? 'http://localhost:4111' : ''

interface Trace {
  id: string
  name: string
  timestamp: string
  totalCost?: number
  inputTokens?: number
  outputTokens?: number
}

interface DailyMetric {
  date: string
  totalCost?: number
  inputUsage?: number
  outputUsage?: number
}

interface UsageData {
  traces: Trace[]
  daily: DailyMetric[]
}

function fmtCost(n?: number) {
  if (n == null) return '—'
  return '$' + (n / 100).toFixed(4)
}

function fmtTokens(n?: number) {
  if (n == null) return '—'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function Usage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(BASE + '/data/usage')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (error) return <div className="p-6 text-sm text-destructive">Error: {error}</div>
  if (!data) return null

  const weekAgo = Date.now() - 7 * 86400000
  const recentTraces = data.traces.filter(t => new Date(t.timestamp).getTime() > weekAgo)
  const weekCost = recentTraces.reduce((s, t) => s + (t.totalCost ?? 0), 0)
  const totalCost = data.traces.reduce((s, t) => s + (t.totalCost ?? 0), 0)
  const totalInput = data.traces.reduce((s, t) => s + (t.inputTokens ?? 0), 0)
  const totalOutput = data.traces.reduce((s, t) => s + (t.outputTokens ?? 0), 0)

  return (
    <div className="overflow-y-auto flex flex-col gap-6 px-6 py-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'This week', value: fmtCost(weekCost * 100) },
          { label: 'All time', value: fmtCost(totalCost * 100) },
          { label: 'Input tokens', value: fmtTokens(totalInput) },
          { label: 'Output tokens', value: fmtTokens(totalOutput) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b border-border">
          Recent traces
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Name', 'Date', 'Time', 'Input', 'Output', 'Cost'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.traces.slice(0, 30).map(t => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 font-medium max-w-[200px] truncate">{t.name}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{fmtDate(t.timestamp)}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{fmtTime(t.timestamp)}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{fmtTokens(t.inputTokens)}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{fmtTokens(t.outputTokens)}</td>
                  <td className="py-2.5 px-3 font-mono text-xs">{fmtCost((t.totalCost ?? 0) * 100)}</td>
                </tr>
              ))}
              {data.traces.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    No traces yet. Start a conversation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
