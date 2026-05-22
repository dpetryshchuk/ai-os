import { useEffect, useState } from 'react'
import { Activity, CheckCircle, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type AppHealth = Record<string, 'ok' | 'error'>

type OsEvent = {
  id: string
  source: string
  type: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export default function Home() {
  const [health, setHealth] = useState<AppHealth>({})
  const [events, setEvents] = useState<OsEvent[]>([])

  useEffect(() => {
    fetch('/api/home/health').then(r => r.json()).then(d => setHealth(d.apps || {}))
    fetch('/api/jobsearch/events?limit=5').then(r => r.json()).then(d => setEvents(d.events || []))
  }, [])

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">AI OS</h1>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">System</h2>
        <div className="flex items-center gap-2">
          {Object.entries(health).length === 0 ? (
            <span className="text-sm text-muted-foreground">Checking…</span>
          ) : (
            Object.entries(health).map(([name, status]) => (
              <div key={name} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2">
                {status === 'ok'
                  ? <CheckCircle className="size-4 text-emerald-500" />
                  : <XCircle className="size-4 text-destructive" />}
                <span className="text-sm">{name}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Activity className="size-4" /> Recent events
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Badge variant={ev.status === 'done' ? 'success' : ev.status === 'failed' ? 'destructive' : 'ghost'}>
                  {ev.status}
                </Badge>
                <span className="text-sm font-mono">{ev.type}</span>
                <span className="text-xs text-muted-foreground ml-auto">{ev.source}</span>
                <span suppressHydrationWarning className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
