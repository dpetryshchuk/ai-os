import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Upload } from 'lucide-react'

interface Application {
  id: string
  title: string
  company_name: string | null
  source: string
  link: string | null
  resume_path: string | null
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
      const r = await fetch('/api/jobsearch/resumes', { method: 'POST', body: fd })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { path } = await r.json()
      onUploaded(path)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const label = uploading ? 'Uploading…' : currentPath ?? 'Upload resume'

  return (
    <>
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 py-1"
        title={currentPath ? 'Replace resume' : 'Upload resume'}
      >
        <Upload size={13} />
        <span className="truncate max-w-[120px]">{label}</span>
      </button>
    </>
  )
}

export default function Applications() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jobsearch/applications')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setApps(d.applications ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const updateResume = (id: string, path: string) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, resume_path: path } : a))
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background z-10 px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold">Applications</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {!loading && !error && `${apps.length} out`}
        </span>
      </div>

      {loading && <p className="px-4 py-6 text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="px-4 py-6 text-sm text-destructive">Error: {error}</p>}

      {!loading && !error && (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {apps.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No applications yet. Tell the agent when you apply to a role.
              </p>
            ) : apps.map(app => (
              <div key={app.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug">{app.title}</span>
                    {app.link && (
                      <a href={app.link} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {app.company_name && <span>{app.company_name}</span>}
                    <span className={app.company_name ? 'before:content-["·"] before:mr-2' : ''}>{app.source}</span>
                  </div>
                  <UploadButton
                    appId={app.id}
                    currentPath={app.resume_path}
                    onUploaded={path => updateResume(app.id, path)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block px-6 py-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Role', 'Company', 'Source', 'Resume', ''].map(h => (
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
                      <td className="py-2.5 px-3 text-muted-foreground">{app.company_name ?? '—'}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{app.source}</td>
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
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                        No applications yet. Tell the agent when you apply to a role.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
