import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Upload } from 'lucide-react'

const BASE = window.location.hostname === 'localhost' ? 'http://localhost:4111' : ''

interface Application {
  id: string
  title: string
  company: string | null
  source: string
  link: string | null
  scraped_date: string
  resume_path: string | null
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface UploadButtonProps {
  appId: string
  currentPath: string | null
  onUploaded: (path: string) => void
}

function UploadButton({ appId, currentPath, onUploaded }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('applicationId', appId)
      const r = await fetch(BASE + '/data/resumes', { method: 'POST', body: fd })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { path } = await r.json()
      onUploaded(path)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const label = uploading ? 'Uploading…' : currentPath ?? 'Upload'

  return (
    <>
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        title={currentPath ? 'Replace resume' : 'Upload resume'}
      >
        <Upload size={12} />
        {label}
      </button>
    </>
  )
}

export default function Applications() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(BASE + '/data/applications')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setApps)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const updateResume = (id: string, path: string) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, resume_path: path } : a))
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background z-10 px-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold">Applications</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {!loading && !error && `${apps.length} out`}
        </span>
      </div>

      <div className="px-6 py-4">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {error && <p className="text-sm text-destructive">Error: {error}</p>}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Role', 'Company', 'Source', 'Applied', 'Resume', ''].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.map(app => (
                  <tr key={app.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-medium">{app.title}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{app.company ?? '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{app.source}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{fmtDate(app.scraped_date)}</td>
                    <td className="py-2.5 px-3">
                      <UploadButton
                        appId={app.id}
                        currentPath={app.resume_path}
                        onUploaded={path => updateResume(app.id, path)}
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      {app.link && (
                        <a href={app.link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {apps.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                      No applications yet. Tell the agent when you apply to a role.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
