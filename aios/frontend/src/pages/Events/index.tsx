import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

function statusVariant(status: string) {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'destructive'
  if (status === 'processing') return 'warning'
  return 'ghost'
}

function duration(ev: OsEvent) {
  if (!ev.started_at || !ev.completed_at) return '—'
  const ms = new Date(ev.completed_at).getTime() - new Date(ev.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function EventsPage() {
  const [events, setEvents] = useState<OsEvent[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/jobsearch/events?limit=100')
      const d = await r.json()
      setEvents(d.events || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Events</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {events.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">No events recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map(ev => (
              <TableRow key={ev.id}>
                <TableCell className="font-mono text-xs">{ev.type}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ev.source}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(ev.status)}>{ev.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{duration(ev)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(ev.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-xs truncate">
                  {ev.error || ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
