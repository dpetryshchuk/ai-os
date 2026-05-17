import { useEffect, useState } from 'react'

interface AppInfo {
  name: string
  url: string
  description: string
}

type HealthStatus = 'ok' | 'error' | 'loading'

export default function App() {
  const [apps, setApps] = useState<AppInfo[]>([])
  const [health, setHealth] = useState<Record<string, HealthStatus>>({})

  useEffect(() => {
    fetch('/api/apps')
      .then(r => r.json())
      .then(data => {
        setApps(data.apps ?? [])
        const init: Record<string, HealthStatus> = {}
        for (const a of data.apps ?? []) init[a.name] = 'loading'
        setHealth(init)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (apps.length === 0) return
    fetch('/api/system-health')
      .then(r => r.json())
      .then(data => setHealth(data.apps ?? {}))
      .catch(() => {})
  }, [apps])

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Dashboard</p>
        <h1 className="text-3xl font-semibold text-foreground">AI OS</h1>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl">
        {apps.map(a => {
          const status = health[a.name] ?? 'loading'
          return (
            <a
              key={a.name}
              href={a.url}
              className="block p-6 bg-card border border-border rounded-xl hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium text-foreground">{a.name}</h2>
                <span
                  className={`w-2 h-2 rounded-full ${
                    status === 'ok'
                      ? 'bg-green-500'
                      : status === 'error'
                      ? 'bg-red-500'
                      : 'bg-muted'
                  }`}
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{a.description}</p>
            </a>
          )
        })}
      </div>
    </div>
  )
}
