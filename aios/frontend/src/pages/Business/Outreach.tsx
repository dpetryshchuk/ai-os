import { useEffect, useState } from 'react'

interface RetroWeek {
  week: string
  total_sent: number
  connected: number
  replied: number
  converted: number
}

export default function Outreach() {
  const [weeks, setWeeks] = useState<RetroWeek[]>([])

  useEffect(() => {
    fetch('/api/outreach/retro?weeks=12')
      .then(r => r.json())
      .then(d => setWeeks(d.weeks ?? []))
      .catch(() => null)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="flex flex-col gap-4 max-w-2xl">
        <h2 className="text-sm font-semibold tracking-tight">Weekly Retro</h2>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No retro data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-6 font-medium text-muted-foreground">Week</th>
                  <th className="pb-2 pr-6 font-medium text-muted-foreground text-right">Sent</th>
                  <th className="pb-2 pr-6 font-medium text-blue-400 text-right">Connected</th>
                  <th className="pb-2 pr-6 font-medium text-amber-400 text-right">Replied</th>
                  <th className="pb-2 font-medium text-green-400 text-right">Converted</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map(w => (
                  <tr key={w.week} className="border-b border-border/50">
                    <td className="py-2 pr-6 font-mono text-xs text-muted-foreground">{w.week}</td>
                    <td className="py-2 pr-6 text-right">{w.total_sent}</td>
                    <td className="py-2 pr-6 text-right text-blue-400">{w.connected}</td>
                    <td className="py-2 pr-6 text-right text-amber-400">{w.replied}</td>
                    <td className="py-2 text-right text-green-400">{w.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
