import { useEffect, useRef, useState } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { marked } from 'marked'
import { api, type Essay, type Frontmatter } from '../lib/api'
import { wikiLinksExtension } from '../plugins/wikiLinks'
import { harperLinter } from '../lib/harperLinter'

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
type ViewMode = 'edit' | 'split' | 'preview'

function renderMarkdown(text: string): string {
  let html = marked.parse(text || '') as string
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span data-wiki="$1" class="prose-wiki-link">[[$1]]</span>')
  return html
}

function ModeToggle({ mode, onMode, narrow }: { mode: ViewMode; onMode: (m: ViewMode) => void; narrow: boolean }) {
  const modes: ViewMode[] = narrow ? ['edit', 'preview'] : ['edit', 'split', 'preview']
  const effective = narrow && mode === 'split' ? 'edit' : mode
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5 bg-background">
      {modes.map(m => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={`px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-colors duration-150 ${
            effective === m ? 'bg-white text-foreground shadow-sm' : 'text-[#9c9590] hover:text-foreground'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

function EditorSaveStatus({ status, lastSaved }: { status: SaveStatus; lastSaved: number | null }) {
  const text: Record<SaveStatus, string> = {
    idle: '',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    saved: lastSaved ? `Saved ${Math.round((Date.now() - lastSaved) / 1000)}s ago` : 'Saved',
    error: 'Save failed',
  }
  return <span className="text-[11px] text-muted-foreground">{text[status]}</span>
}

interface EditorProps {
  folder: string
  slug: string
  initialBody: string
  frontmatterRef: React.RefObject<Frontmatter | null>
  bodyRef: React.MutableRefObject<string>
  essays: Essay[]
  onSelectEssay: (folder: string, slug: string) => void
  onCreateEssay: (folder: string, title: string) => void
}

export default function Editor({ folder, slug, initialBody, frontmatterRef, bodyRef, essays, onSelectEssay, onCreateEssay }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [mode, setMode] = useState<ViewMode>('edit')
  const [previewHtml, setPreviewHtml] = useState(() => renderMarkdown(initialBody))
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setSaveStatus('idle')
    setLastSaved(null)
    setPreviewHtml(renderMarkdown(initialBody))
  }, [folder, slug])

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      doc: initialBody,
      extensions: [
        minimalSetup,
        markdown(),
        EditorView.lineWrapping,
        wikiLinksExtension(),
        harperLinter,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          const value = update.state.doc.toString()
          bodyRef.current = value
          setPreviewHtml(renderMarkdown(value))
          setSaveStatus('unsaved')
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(async () => {
            setSaveStatus('saving')
            try {
              if (!frontmatterRef.current) return
              await api.essays.write(folder, slug, frontmatterRef.current, value)
              setSaveStatus('saved')
              setLastSaved(Date.now())
            } catch {
              setSaveStatus('error')
            }
          }, 1000)
        }),
      ],
      parent: containerRef.current,
    })
    return () => {
      view.destroy()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [folder, slug])

  function handleWikiClick(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cm-wiki-link, [data-wiki]')
    if (!el) return
    const title = el.dataset.wiki ?? el.textContent?.slice(2, -2) ?? ''
    const match = essays.find(es => String(es.title ?? es.slug).toLowerCase() === title.toLowerCase())
    if (match) onSelectEssay(match.folder, match.slug)
    else onCreateEssay(folder, title)
  }

  const effectiveMode = narrow && mode === 'split' ? 'edit' : mode
  const showEditor = effectiveMode !== 'preview'
  const showPreview = effectiveMode !== 'edit'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2 border-b border-border flex-shrink-0">
        <EditorSaveStatus status={saveStatus} lastSaved={lastSaved} />
        <ModeToggle mode={mode} onMode={setMode} narrow={narrow} />
      </div>
      <div className="flex-1 overflow-hidden flex">
        <div
          ref={containerRef}
          onClick={handleWikiClick}
          style={{ display: showEditor ? undefined : 'none' }}
          className={showEditor && showPreview ? 'w-1/2 border-r border-border overflow-y-auto' : 'w-full overflow-y-auto'}
        />
        {showPreview && (
          <div
            onClick={handleWikiClick}
            className={`overflow-y-auto prose-editor ${showEditor ? 'w-1/2' : 'w-full'}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  )
}
