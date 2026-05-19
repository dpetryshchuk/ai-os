// onekeyflow/frontend/src/pages/Events/index.tsx
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface OkfEvent {
  id: string
  type: string
  source: string
  status: string
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

function statusVariant(
  status: string,
): 'success' | 'destructive' | 'warning' | 'ghost' {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'destructive'
  if (status === 'processing') return 'warning'
  return 'ghost'
}

function duration(event: OkfEvent): string {
  if (!event.started_at || !event.completed_at) return '—'
  const ms =
    new Date(event.completed_at).getTime() -
    new Date(event.started_at).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function pandadocUrl(event: OkfEvent): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (event.result as any)?.pandadoc?.url ?? null
}

function companyName(event: OkfEvent): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (event.payload as any)?.company ?? '—'
}

export default function Events() {
  const [events, setEvents] = useState<OkfEvent[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/proposals/events')
      const data = await res.json()
      setEvents(data.events ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    const hasPending = events.some(
      (e) => e.status === 'pending' || e.status === 'processing',
    )
    if (!hasPending) return
    const id = setInterval(fetchEvents, 3000)
    return () => clearInterval(id)
  }, [events, fetchEvents])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Proposal generation history
          </p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>PandaDoc</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-mono text-xs">{event.type}</TableCell>
                <TableCell>{companyName(event)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(event.status)}>
                    {event.status}
                  </Badge>
                </TableCell>
                <TableCell>{duration(event)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  {pandadocUrl(event) ? (
                    <a
                      href={pandadocUrl(event)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-foreground hover:text-foreground/70 transition-colors"
                    >
                      <ExternalLink size={12} />
                      Open
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
