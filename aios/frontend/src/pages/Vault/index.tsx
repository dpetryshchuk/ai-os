import { useEffect, useState, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { ChevronRight, FileText, Edit2, Save, X as XIcon, FolderOpen } from 'lucide-react'

interface VaultFile {
  path: string
  name: string
  folder: string
  size: number
  modified: number
}

export default function Vault() {
  const [files, setFiles] = useState<VaultFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['', 'AI OS', '00 Inbox']))

  useEffect(() => {
    fetch('/api/vault/tree')
      .then(r => r.json())
      .then(d => setFiles(d.files ?? []))
  }, [])

  const loadFile = useCallback((path: string) => {
    setSelected(path)
    setEditing(false)
    fetch(`/api/vault/file?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(d => { setContent(d.content); setDraft(d.content) })
  }, [])

  const save = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    await fetch(`/api/vault/file?path=${encodeURIComponent(selected)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draft }),
    })
    setContent(draft)
    setEditing(false)
    setSaving(false)
  }, [selected, draft])

  // Group files by folder
  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.path.toLowerCase().includes(search.toLowerCase()))
    : files

  const byFolder: Record<string, VaultFile[]> = {}
  for (const f of filtered) {
    const folder = f.folder || ''
    if (!byFolder[folder]) byFolder[folder] = []
    byFolder[folder].push(f)
  }
  const folders = Object.keys(byFolder).sort()

  const toggleFolder = (folder: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* File tree */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <input
            placeholder="Search files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm bg-muted/30 border border-border rounded px-2 py-1 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/30"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {folders.map(folder => (
            <div key={folder}>
              {/* Folder header */}
              <button
                onClick={() => toggleFolder(folder)}
                className="flex items-center gap-1.5 w-full px-3 py-1 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronRight
                  size={12}
                  className={cn('text-muted-foreground shrink-0 transition-transform', openFolders.has(folder) && 'rotate-90')}
                />
                {folder ? (
                  <>
                    <FolderOpen size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground truncate">{folder}</span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">Root</span>
                )}
              </button>
              {/* Files in folder */}
              {openFolders.has(folder) && byFolder[folder].map(f => (
                <button
                  key={f.path}
                  onClick={() => loadFile(f.path)}
                  className={cn(
                    'flex items-center gap-2 w-full pl-8 pr-3 py-1 text-left text-sm transition-colors',
                    selected === f.path
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <FileText size={12} className="shrink-0" />
                  <span className="truncate text-xs">{f.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Content pane */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selected ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
              <span className="text-xs text-muted-foreground font-mono truncate">{selected}</span>
              <div className="flex items-center gap-1">
                {editing ? (
                  <>
                    <button
                      onClick={save}
                      disabled={saving}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-foreground text-background hover:opacity-80 disabled:opacity-50 transition-opacity"
                    >
                      <Save size={11} />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setDraft(content) }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <XIcon size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditing(true); setDraft(content) }}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
                  >
                    <Edit2 size={11} />
                    Edit
                  </button>
                )}
              </div>
            </div>
            {/* Body */}
            {editing ? (
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none bg-background text-foreground"
              />
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div
                  className="prose prose-sm prose-neutral max-w-3xl"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(content) as string) }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <FileText size={32} className="text-muted-foreground/40" />
            <p className="text-sm font-medium">Knowledge Base</p>
            <p className="text-xs text-muted-foreground">{files.length} notes · select one to read</p>
          </div>
        )}
      </div>
    </div>
  )
}
