import { useEffect, useRef, useState } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { marked } from 'marked'
import { api } from '../lib/api'
import { wikiLinksExtension } from '../plugins/wikiLinks'

function renderMarkdown(text) {
  let html = marked.parse(text || '')
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span data-wiki="$1" class="prose-wiki-link">[[$1]]</span>')
  return html
}

function ModeToggle({ mode, onMode, narrow }) {
  const modes = narrow ? ['edit', 'preview'] : ['edit', 'split', 'preview']
  const effective = narrow && mode === 'split' ? 'edit' : mode
  return (
    <div className="flex gap-0.5 rounded-md border border-[#e8e5e0] p-0.5 bg-[#f7f6f3]">
      {modes.map(m => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={`px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-colors ${
            effective === m
              ? 'bg-white text-[#1a1916] shadow-sm'
              : 'text-[#9c9590] hover:text-[#1a1916]'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

function SaveStatus({ status, lastSaved }) {
  const text = {
    idle: '',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    saved: lastSaved ? `Saved ${Math.round((Date.now() - lastSaved) / 1000)}s ago` : 'Saved',
    error: 'Save failed',
  }[status] || ''
  return <span className="text-[11px] text-[#c4bfb9]">{text}</span>
}

export default function Editor({ folder, slug, initialBody, frontmatterRef, bodyRef, essays, onSelectEssay, onCreateEssay }) {
  const containerRef = useRef(null)
  const saveTimerRef = useRef(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [lastSaved, setLastSaved] = useState(null)
  const [mode, setMode] = useState('edit')
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
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          const value = update.state.doc.toString()
          if (bodyRef) bodyRef.current = value
          setPreviewHtml(renderMarkdown(value))
          setSaveStatus('unsaved')
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(async () => {
            setSaveStatus('saving')
            try {
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

  function handleWikiClick(e) {
    const el = e.target.closest('.cm-wiki-link, [data-wiki]')
    if (!el) return
    const title = el.dataset.wiki ?? el.textContent.slice(2, -2)
    const match = essays?.find(es =>
      String(es.title ?? es.slug).toLowerCase() === title.toLowerCase()
    )
    if (match) {
      onSelectEssay?.(match.folder, match.slug)
    } else {
      onCreateEssay?.(folder, title)
    }
  }

  const effectiveMode = narrow && mode === 'split' ? 'edit' : mode
  const showEditor = effectiveMode !== 'preview'
  const showPreview = effectiveMode !== 'edit'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2 border-b border-[#e8e5e0] flex-shrink-0">
        <SaveStatus status={saveStatus} lastSaved={lastSaved} />
        <ModeToggle mode={mode} onMode={setMode} narrow={narrow} />
      </div>
      <div className="flex-1 overflow-hidden flex">
        <div
          ref={containerRef}
          onClick={handleWikiClick}
          style={{ display: showEditor ? undefined : 'none' }}
          className={showEditor && showPreview ? 'w-1/2 border-r border-[#e8e5e0] overflow-y-auto' : 'w-full overflow-y-auto'}
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
