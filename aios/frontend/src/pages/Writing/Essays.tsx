import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ChevronDown, ChevronRight, Plus, Trash2, MoreHorizontal, ArrowLeft, GitBranch, FolderPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

// ──── Types ────────────────────────────────────────────────────────────────

interface Essay { folder: string; slug: string; title: string }
interface Frontmatter {
  title?: string; tags?: string[]; status?: string; date?: string
  description?: string; toc?: boolean; [key: string]: unknown
}
interface EssayData { frontmatter: Frontmatter; body: string }

// ──── Hooks ────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ──── API ──────────────────────────────────────────────────────────────────

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/writing' + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

const api = {
  essays: {
    list: () => req<{ essays: Essay[] }>('GET', '/essays').then(d => d.essays),
    read: (folder: string, slug: string) =>
      req<{ essay: EssayData }>('GET', `/essays/${folder}/${slug}`).then(d => d.essay),
    write: (folder: string, slug: string, frontmatter: Frontmatter, body: string) =>
      req('PUT', `/essays/${folder}/${slug}`, { frontmatter, body }),
    create: (folder: string, title: string) =>
      req<{ essay: Essay }>('POST', '/essays', { folder, title }).then(d => d.essay),
    delete: (folder: string, slug: string) =>
      req('DELETE', `/essays/${folder}/${slug}`),
    move: (folder: string, slug: string, targetFolder: string) =>
      req('PATCH', `/essays/${folder}/${slug}/move`, { folder: targetFolder }),
  },
  folders: {
    list: () => req<{ folders: string[] }>('GET', '/folders').then(d => d.folders),
    create: (name: string) => req('POST', '/folders', { name }),
    rename: (folder: string, name: string) => req('PATCH', `/folders/${folder}`, { name }),
    delete: (folder: string) => req('DELETE', `/folders/${folder}`),
  },
  git: {
    pull: () => req<{ output: string }>('POST', '/git/pull').then(d => d.output),
    push: (message: string) =>
      req<{ output: string }>('POST', '/git/push', { message }).then(d => d.output),
  },
}

// ──── List panel ───────────────────────────────────────────────────────────

interface ListPanelProps {
  folders: string[]
  essays: Essay[]
  activeFolder: string | null
  activeSlug: string | null
  commitMessage: string
  onSelectEssay: (folder: string, slug: string) => void
  onCreateEssay: (folder: string, title: string) => void
  onDeleteEssay: (folder: string, slug: string) => void
  onMoveEssay: (folder: string, slug: string, targetFolder: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (oldName: string, newName: string) => void
  onDeleteFolder: (name: string) => void
  onPull: () => void
  onCommitMessageChange: (msg: string) => void
  onPush: () => void
}

function ListPanel({
  folders, essays, activeFolder, activeSlug, commitMessage,
  onSelectEssay, onCreateEssay, onDeleteEssay, onMoveEssay,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  onPull, onCommitMessageChange, onPush,
}: ListPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [newEssayFolder, setNewEssayFolder] = useState<string | null>(null)
  const [newEssayTitle, setNewEssayTitle] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  const newEssayInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (newFolderMode) newFolderInputRef.current?.focus() }, [newFolderMode])
  useEffect(() => { if (newEssayFolder) newEssayInputRef.current?.focus() }, [newEssayFolder])

  const toggle = (folder: string) =>
    setCollapsed(s => ({ ...s, [folder]: !s[folder] }))

  const essaysIn = (folder: string) => essays.filter(e => e.folder === folder)

  const handleFolderMenu = (folder: string) => {
    const action = window.prompt(`"${folder}": type rename or delete`)?.toLowerCase()
    if (!action) return
    if (action === 'delete') {
      if (essaysIn(folder).length > 0) return alert('Delete all essays in this folder first.')
      if (confirm(`Delete folder "${folder}"?`)) onDeleteFolder(folder)
    } else if (action === 'rename') {
      const n = window.prompt('New name:', folder)
      if (n && n.trim() && n.trim() !== folder) onRenameFolder(folder, n.trim())
    }
  }

  const handleEssayMenu = (essay: Essay) => {
    const action = window.prompt(`"${essay.title || essay.slug}": type move or delete`)?.toLowerCase()
    if (!action) return
    if (action === 'delete') {
      if (confirm('Delete this essay?')) onDeleteEssay(essay.folder, essay.slug)
    } else if (action === 'move') {
      const t = window.prompt('Move to folder:', essay.folder)
      if (t && t.trim() && t.trim() !== essay.folder) onMoveEssay(essay.folder, essay.slug, t.trim())
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] tracking-[0.1em] text-muted-foreground font-semibold uppercase">Essays</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onPull}
            title="Pull from GitHub"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <GitBranch className="size-3.5" />
          </button>
          <button
            onClick={() => setNewFolderMode(true)}
            title="New folder"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FolderPlus className="size-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {newFolderMode && (
          <input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (newFolderName.trim()) onCreateFolder(newFolderName.trim())
                setNewFolderMode(false); setNewFolderName('')
              }
              if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') }
            }}
            onBlur={() => { setNewFolderMode(false); setNewFolderName('') }}
            placeholder="Folder name…"
            className="mx-3 mb-1 w-[calc(100%-24px)] bg-background border border-border rounded-md px-2.5 py-1.5 text-xs outline-none"
          />
        )}

        {folders.map(folder => {
          const isOpen = !collapsed[folder]
          const folderEssays = essaysIn(folder)
          return (
            <div key={folder}>
              {/* Folder row */}
              <div className="flex items-center px-2 py-1 group">
                <button
                  onClick={() => toggle(folder)}
                  className="flex items-center gap-1 flex-1 min-w-0 py-1 text-left"
                >
                  {isOpen
                    ? <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground truncate transition-colors ml-0.5">
                    {folder}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 md:flex transition-opacity">
                  <button
                    onClick={() => { setNewEssayFolder(folder); setNewEssayTitle(''); setCollapsed(s => ({ ...s, [folder]: false })) }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="New essay"
                  >
                    <Plus className="size-3" />
                  </button>
                  <button
                    onClick={() => handleFolderMenu(folder)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Folder actions"
                  >
                    <MoreHorizontal className="size-3" />
                  </button>
                </div>
                {/* Always visible on mobile */}
                <div className="flex items-center gap-0.5 md:hidden">
                  <button
                    onClick={() => { setNewEssayFolder(folder); setNewEssayTitle(''); setCollapsed(s => ({ ...s, [folder]: false })) }}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Essays */}
              {isOpen && (
                <div>
                  {folderEssays.map(essay => (
                    <div
                      key={essay.slug}
                      className={cn(
                        'group flex items-center pl-6 pr-2 py-2 cursor-pointer transition-colors',
                        activeFolder === essay.folder && activeSlug === essay.slug
                          ? 'bg-muted/60 border-l-2 border-foreground'
                          : 'hover:bg-muted/30 border-l-2 border-transparent',
                      )}
                    >
                      <button
                        onClick={() => onSelectEssay(essay.folder, essay.slug)}
                        className="flex-1 text-left min-w-0"
                      >
                        <span className={cn(
                          'text-[12.5px] truncate block transition-colors',
                          activeFolder === essay.folder && activeSlug === essay.slug
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground group-hover:text-foreground',
                        )}>
                          {essay.title || essay.slug}
                        </span>
                      </button>
                      {/* Delete — hover on desktop, always on mobile */}
                      <button
                        onClick={() => handleEssayMenu(essay)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0"
                        title="Essay actions"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Inline new essay input */}
                  {newEssayFolder === folder && (
                    <input
                      ref={newEssayInputRef}
                      value={newEssayTitle}
                      onChange={e => setNewEssayTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (newEssayTitle.trim()) onCreateEssay(folder, newEssayTitle.trim())
                          setNewEssayFolder(null); setNewEssayTitle('')
                        }
                        if (e.key === 'Escape') { setNewEssayFolder(null); setNewEssayTitle('') }
                      }}
                      onBlur={() => { setNewEssayFolder(null); setNewEssayTitle('') }}
                      placeholder="Essay title…"
                      className="ml-6 mr-3 my-1 w-[calc(100%-36px)] bg-background border border-border rounded px-2 py-1.5 text-xs outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Git footer */}
      <div className="border-t border-border p-3 shrink-0">
        <input
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
          placeholder="Commit message…"
          className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-[11.5px] font-mono text-muted-foreground outline-none mb-2 placeholder:text-muted-foreground"
        />
        <button
          onClick={onPush}
          className="w-full bg-foreground text-background rounded-md p-2 text-[11.5px] font-medium hover:opacity-90 transition-opacity"
        >
          ↑ Push to GitHub
        </button>
      </div>
    </div>
  )
}

// ──── Frontmatter bar ──────────────────────────────────────────────────────

function FrontmatterBar({ frontmatter, onChange }: { frontmatter: Frontmatter | null; onChange: (fm: Frontmatter) => void }) {
  if (!frontmatter) return null
  const { title = '', tags = [], status = 'in-progress', date = '' } = frontmatter
  const update = (patch: Partial<Frontmatter>) => onChange({ ...frontmatter, ...patch })
  return (
    <div className="border-b border-border bg-background shrink-0 px-4 py-2.5 flex flex-wrap gap-3 items-center">
      <input
        value={title}
        onChange={e => update({ title: e.target.value })}
        className="bg-transparent text-sm font-semibold outline-none flex-1 min-w-[140px] placeholder:text-muted-foreground"
        placeholder="Untitled"
      />
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {tag}
            <button onClick={() => update({ tags: tags.filter(t => t !== tag) })} className="leading-none hover:text-foreground">×</button>
          </span>
        ))}
        <select
          value={status}
          onChange={e => update({ status: e.target.value })}
          className="bg-muted text-muted-foreground text-[11px] rounded-full px-2.5 py-1 outline-none cursor-pointer"
        >
          <option value="in-progress">in progress</option>
          <option value="published">published</option>
        </select>
        {date && <span className="text-[11px] text-muted-foreground">{date}</span>}
      </div>
    </div>
  )
}

// ──── Editor panel ─────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
type ViewMode = 'edit' | 'split' | 'preview'

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text || '') as string)
}

interface EditorPanelProps {
  folder: string
  slug: string
  title: string
  initialBody: string
  frontmatterRef: React.RefObject<Frontmatter | null>
  bodyRef: React.MutableRefObject<string>
  isMobile: boolean
  onBack: () => void
}

function EditorPanel({ folder, slug, title, initialBody, frontmatterRef, bodyRef, isMobile, onBack }: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [mode, setMode] = useState<ViewMode>('edit')
  const [previewHtml, setPreviewHtml] = useState(() => renderMarkdown(initialBody))

  useEffect(() => {
    setSaveStatus('idle'); setLastSaved(null); setPreviewHtml(renderMarkdown(initialBody))
  }, [folder, slug])

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      doc: initialBody,
      extensions: [
        minimalSetup, markdown(), EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return
          const value = update.state.doc.toString()
          bodyRef.current = value
          setSaveStatus('unsaved')
          setPreviewHtml(renderMarkdown(value))
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(async () => {
            setSaveStatus('saving')
            try {
              if (frontmatterRef.current) await api.essays.write(folder, slug, frontmatterRef.current, value)
              setSaveStatus('saved'); setLastSaved(Date.now())
            } catch { setSaveStatus('error') }
          }, 1000)
        }),
      ],
      parent: containerRef.current,
    })
    return () => {
      // flush unsaved on unmount
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        if (frontmatterRef.current && bodyRef.current)
          api.essays.write(folder, slug, frontmatterRef.current, bodyRef.current).catch(() => {})
      }
      view.destroy()
    }
  }, [folder, slug])

  const statusText: Record<SaveStatus, string> = {
    idle: '', unsaved: 'Unsaved', saving: 'Saving…',
    saved: lastSaved ? `Saved ${Math.round((Date.now() - lastSaved) / 1000)}s ago` : 'Saved',
    error: 'Save failed',
  }

  // On mobile only show Edit/Preview, not Split
  const availableModes: ViewMode[] = isMobile ? ['edit', 'preview'] : ['edit', 'split', 'preview']
  const effectiveMode = (isMobile && mode === 'split') ? 'edit' : mode
  const showEditor = effectiveMode !== 'preview'
  const showPreview = effectiveMode !== 'edit'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {isMobile && (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1 rounded text-muted-foreground hover:text-foreground transition-colors mr-1"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        {isMobile && (
          <span className="text-sm font-medium flex-1 truncate">{title || 'Untitled'}</span>
        )}
        <span className={cn('text-[11px] text-muted-foreground', isMobile ? '' : 'flex-1')}>
          {statusText[effectiveMode === 'edit' ? saveStatus : 'idle']}
        </span>
        <div className="flex gap-0.5 rounded-md border border-border p-0.5">
          {availableModes.map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-colors',
                effectiveMode === m ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        <div
          ref={containerRef}
          className={cn('overflow-y-auto', showEditor && showPreview ? 'w-1/2 border-r border-border' : 'w-full')}
          style={{ display: showEditor ? undefined : 'none' }}
        />
        {showPreview && (
          <div
            className={cn('overflow-y-auto px-6 py-5 prose prose-sm prose-neutral max-w-none', showEditor ? 'w-1/2' : 'w-full')}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  )
}

// ──── App state ────────────────────────────────────────────────────────────

type AppState = {
  folders: string[]; essays: Essay[]
  activeFolder: string | null; activeSlug: string | null
  essay: EssayData | null; commitMessage: string
}
type AppAction =
  | { type: 'set_list'; folders: string[]; essays: Essay[] }
  | { type: 'select_essay'; folder: string; slug: string; data: EssayData }
  | { type: 'deselect_essay' }
  | { type: 'set_essay'; essay: EssayData }
  | { type: 'move_essay'; folder: string }
  | { type: 'set_commit'; message: string }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set_list': return { ...state, folders: action.folders, essays: action.essays }
    case 'select_essay': return { ...state, activeFolder: action.folder, activeSlug: action.slug, essay: action.data }
    case 'deselect_essay': return { ...state, activeFolder: null, activeSlug: null, essay: null }
    case 'set_essay': return { ...state, essay: action.essay }
    case 'move_essay': return { ...state, activeFolder: action.folder }
    case 'set_commit': return { ...state, commitMessage: action.message }
  }
}

// ──── Page ─────────────────────────────────────────────────────────────────

export default function Essays() {
  const isMobile = useIsMobile()
  const [panel, setPanel] = useState<'list' | 'editor'>('list')

  const [state, dispatch] = useReducer(appReducer, {
    folders: [], essays: [], activeFolder: null, activeSlug: null, essay: null, commitMessage: '',
  })
  const { folders, essays, activeFolder, activeSlug, essay, commitMessage } = state
  const frontmatterRef = useRef<Frontmatter | null>(null)
  const bodyRef = useRef<string>('')

  const loadList = useCallback(async () => {
    const [f, e] = await Promise.all([api.folders.list(), api.essays.list()])
    dispatch({ type: 'set_list', folders: f, essays: e })
  }, [])

  useEffect(() => { loadList() }, [loadList])

  async function selectEssay(folder: string, slug: string) {
    const data = await api.essays.read(folder, slug)
    dispatch({ type: 'select_essay', folder, slug, data })
    frontmatterRef.current = data.frontmatter
    bodyRef.current = data.body
    if (isMobile) setPanel('editor')
  }

  function handleFrontmatterChange(fm: Frontmatter) {
    if (!essay) return
    dispatch({ type: 'set_essay', essay: { ...essay, frontmatter: fm } })
    frontmatterRef.current = fm
    if (activeFolder && activeSlug) api.essays.write(activeFolder, activeSlug, fm, bodyRef.current)
  }

  async function handleCreateEssay(folder: string, title: string) {
    const created = await api.essays.create(folder, title)
    await loadList()
    await selectEssay(created.folder, created.slug)
  }

  async function handleDeleteEssay(folder: string, slug: string) {
    await api.essays.delete(folder, slug)
    if (activeFolder === folder && activeSlug === slug) {
      dispatch({ type: 'deselect_essay' })
      if (isMobile) setPanel('list')
    }
    await loadList()
  }

  async function handleMoveEssay(folder: string, slug: string, targetFolder: string) {
    await api.essays.move(folder, slug, targetFolder)
    await loadList()
    if (activeFolder === folder && activeSlug === slug)
      dispatch({ type: 'move_essay', folder: targetFolder })
  }

  const listPanel = (
    <ListPanel
      folders={folders} essays={essays}
      activeFolder={activeFolder} activeSlug={activeSlug}
      commitMessage={commitMessage}
      onSelectEssay={selectEssay}
      onCreateEssay={handleCreateEssay}
      onDeleteEssay={async (f, s) => { try { await handleDeleteEssay(f, s) } catch (e) { alert((e as Error).message) } }}
      onMoveEssay={async (f, s, t) => { try { await handleMoveEssay(f, s, t) } catch (e) { alert((e as Error).message) } }}
      onCreateFolder={async (name) => { try { await api.folders.create(name); await loadList() } catch (e) { alert((e as Error).message) } }}
      onRenameFolder={async (old, n) => {
        try {
          await api.folders.rename(old, n)
          if (activeFolder === old) dispatch({ type: 'move_essay', folder: n })
          await loadList()
        } catch (e) { alert((e as Error).message) }
      }}
      onDeleteFolder={async (name) => { try { await api.folders.delete(name); await loadList() } catch (e) { alert((e as Error).message) } }}
      onPull={async () => { try { const out = await api.git.pull(); alert(out || 'Pulled.'); await loadList() } catch (e) { alert((e as Error).message) } }}
      onCommitMessageChange={msg => dispatch({ type: 'set_commit', message: msg })}
      onPush={async () => {
        if (!commitMessage.trim()) return alert('Enter a commit message first.')
        try { const out = await api.git.push(commitMessage); alert(out || 'Pushed.'); dispatch({ type: 'set_commit', message: '' }) }
        catch (e) { alert((e as Error).message) }
      }}
    />
  )

  const editorPanel = essay && activeFolder && activeSlug ? (
    <div className="flex flex-col h-full overflow-hidden">
      <FrontmatterBar frontmatter={essay.frontmatter} onChange={handleFrontmatterChange} />
      <EditorPanel
        folder={activeFolder} slug={activeSlug}
        title={essay.frontmatter.title || activeSlug}
        initialBody={essay.body}
        frontmatterRef={frontmatterRef} bodyRef={bodyRef}
        isMobile={isMobile}
        onBack={() => setPanel('list')}
      />
    </div>
  ) : (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
      <p className="text-sm">Select an essay or create a new one</p>
      {isMobile && (
        <button
          onClick={() => setPanel('list')}
          className="flex items-center gap-1.5 text-sm text-foreground border border-border rounded-lg px-4 py-2"
        >
          <ArrowLeft className="size-4" /> Browse essays
        </button>
      )}
    </div>
  )

  // Mobile: one panel at a time
  if (isMobile) {
    return (
      <div className="h-full overflow-hidden">
        {panel === 'list' ? listPanel : editorPanel}
      </div>
    )
  }

  // Desktop: side by side
  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[220px] shrink-0 border-r border-border overflow-hidden">
        {listPanel}
      </div>
      <div className="flex-1 overflow-hidden">
        {editorPanel}
      </div>
    </div>
  )
}
