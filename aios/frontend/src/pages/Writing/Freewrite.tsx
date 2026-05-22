import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ──── Types ────────────────────────────────────────────────────────────────

interface Entry { id: string; created_at: string; is_video: boolean; preview: string }

// ──── API ──────────────────────────────────────────────────────────────────

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/writing/freewrite' + path, {
    method,
    headers: body != null && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

const api = {
  list: () => req<{ entries: Entry[] }>('GET', '/entries').then(d => d.entries),
  create: () => req<{ id: string }>('POST', '/entries').then(d => d.id),
  get: (id: string) => req<{ text: string }>('GET', `/entries/${id}`).then(d => d.text),
  save: (id: string, text: string) => req('PUT', `/entries/${id}`, { text }),
  delete: (id: string) => req('DELETE', `/entries/${id}`),
  uploadVideo: (id: string, video: Blob, transcript?: string) => {
    const form = new FormData()
    form.append('video', video, `${id}.webm`)
    if (transcript) form.append('transcript', transcript)
    return req('POST', `/entries/${id}/video`, form)
  },
  videoUrl: (id: string) => `/api/writing/freewrite/entries/${id}/video`,
}

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

const DEFAULT_SECONDS = 900

function useTimer() {
  const [total, setTotal] = useState(DEFAULT_SECONDS)
  const [remaining, setRemaining] = useState(DEFAULT_SECONDS)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { setRunning(false); return 0 }
        return r - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const toggle = useCallback(() => setRunning(r => !r), [])
  const reset = useCallback(() => { setRunning(false); setRemaining(total) }, [total])
  const adjustMinutes = useCallback((delta: number) => {
    setRunning(false)
    setTotal(t => {
      const next = Math.max(0, Math.min(2700, t + delta * 60))
      setRemaining(next)
      return next
    })
  }, [])

  const display = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
  return { display, running, remaining, toggle, reset, adjustMinutes }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PLACEHOLDERS = [
  'Begin writing', 'Pick a thought and go', 'Start typing',
  "What's on your mind", 'Just start', 'Type your first thought',
  'Start with one sentence', 'Just say it',
]

const FONTS = ['system-ui, sans-serif', 'Georgia, serif', 'Arial, sans-serif', "'Courier New', monospace"]
const FONT_SIZES = [16, 18, 20, 22, 24, 26]

// ──── ChatPopover ──────────────────────────────────────────────────────────

const CHATGPT_PROMPT = `below is my journal entry. wyt? talk through it with me like a friend. don't therapize me and give me a whole breakdown, don't repeat my thoughts with headings. really take all of this, and tell me back stuff truly as if you're an old homie. Keep it casual, dont say yo, help me make new connections i don't see, comfort, validate, challenge, all of it. dont be afraid to say a lot. format with markdown headings if needed. do not just go through every single thing i say, and say it back to me. you need to proccess everything i say, make connections i don't see, and deliver it all back to me as a story that makes me feel what you think i wanna feel. thats what the best therapists do. ideally, you're style/tone should sound like the user themselves. it's as if the user is hearing their own tone but it should still feel different, because you have different things to say and don't just repeat back what they say. else, start by saying, 'hey, thanks for showing me this. my thoughts:' my entry:`

const CLAUDE_PROMPT = `Take a look at my journal entry below. I'd like you to analyze it and respond with deep insight that feels personal, not clinical. Imagine you're not just a friend, but a mentor who truly gets both my tech background and my psychological patterns. I want you to uncover the deeper meaning and emotional undercurrents behind my scattered thoughts. Keep it casual, dont say yo, help me make new connections i don't see, comfort, validate, challenge, all of it. dont be afraid to say a lot. format with markdown headings if needed. Use vivid metaphors and powerful imagery to help me see what I'm really building. Organize your thoughts with meaningful headings that create a narrative journey through my ideas. Don't just validate my thoughts - reframe them in a way that shows me what I'm really seeking beneath the surface. Go beyond the product concepts to the emotional core of what I'm trying to solve. Be willing to be profound and philosophical without sounding like you're giving therapy. I want someone who can see the patterns I can't see myself and articulate them in a way that feels like an epiphany. Start with 'hey, thanks for showing me this. my thoughts:' and then use markdown headings to structure your response. Here's my entry:`

function ChatPopover({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [onClose])

  const tooShort = text.replace(/\s/g, '').length < 350

  return (
    <div ref={ref} className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 rounded-lg border border-border bg-card shadow-lg p-3 text-sm z-20">
      {tooShort ? (
        <p className="text-muted-foreground text-xs leading-relaxed text-center">
          Please free write for at minimum 5 minutes first. Then click this. Trust.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => { window.open(`https://chat.openai.com/?prompt=${encodeURIComponent(CHATGPT_PROMPT + '\n\n' + text)}`, '_blank'); onClose() }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors text-xs"
          >
            ChatGPT
          </button>
          <div className="border-t border-border" />
          <button
            onClick={() => { window.open(`https://claude.ai/new?q=${encodeURIComponent(CLAUDE_PROMPT + '\n\n' + text)}`, '_blank'); onClose() }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors text-xs"
          >
            Claude
          </button>
        </div>
      )}
    </div>
  )
}

// ──── VideoRecorder ────────────────────────────────────────────────────────

function VideoRecorder({ entryId, onDone, onClose }: { entryId: string; onDone: () => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true }
      })
      .catch(() => setError('Camera or microphone permission denied.'))
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  function startRecording() {
    if (!streamRef.current) return
    chunksRef.current = []
    const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' })
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(100)
    mediaRecorderRef.current = mr
    setRecording(true)
    setElapsed(0)
    intervalRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }

  async function stopRecording() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const mr = mediaRecorderRef.current
    if (!mr) return
    setRecording(false)
    setUploading(true)
    await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop() })
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    await api.uploadVideo(entryId, blob)
    setUploading(false)
    onDone()
  }

  const elapsed$ = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover w-full" />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-center p-8">
          <div>
            <p className="mb-4">{error}</p>
            <button onClick={onClose} className="underline text-sm">Close</button>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-6 bg-gradient-to-t from-black/70 to-transparent">
          <button onClick={onClose} className="text-white/70 hover:text-white text-sm transition-colors">Close</button>
          <span className="text-white font-mono text-sm">{elapsed$}</span>
          {uploading ? (
            <span className="text-white/70 text-sm">Saving…</span>
          ) : recording ? (
            <button onClick={stopRecording} className="text-red-400 hover:text-red-300 text-sm">Stop Recording</button>
          ) : (
            <button onClick={startRecording} className="text-white hover:text-white/80 text-sm">Start Recording</button>
          )}
        </div>
      )}
    </div>
  )
}

// ──── VideoPlayer ──────────────────────────────────────────────────────────

function VideoPlayer({ entryId, onBack }: { entryId: string; onBack: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center overflow-y-auto pt-12 px-6">
      <div className="w-full" style={{ maxWidth: 650 }}>
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors flex items-center gap-1">
          <ArrowLeft size={14} /> back to writing
        </button>
        <video src={api.videoUrl(entryId)} controls className="w-full rounded-lg bg-gray-950" />
      </div>
    </div>
  )
}

// ──── Timer button ─────────────────────────────────────────────────────────

function TimerButton({ display, running, onToggle, onReset, onAdjust }: {
  display: string; running: boolean
  onToggle: () => void; onReset: () => void; onAdjust: (d: number) => void
}) {
  const clicksRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTimerClick() {
    clicksRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (clicksRef.current === 1) onToggle(); else onReset()
      clicksRef.current = 0
    }, 220)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    onAdjust(e.deltaY < 0 ? 1 : -1)
  }

  return (
    <button
      onClick={handleTimerClick}
      onWheel={handleWheel}
      className={cn('font-mono text-sm tabular-nums select-none', running ? 'opacity-100' : 'opacity-60 hover:opacity-100')}
      title="Click to start/pause · Double-click to reset · Scroll to adjust"
    >
      {display}
    </button>
  )
}

// ──── BottomNav ────────────────────────────────────────────────────────────

function BottomNav({
  timer, backspaceEnabled, onToggleBackspace, fontFamily, fontSize,
  onCycleFont, onCycleSize, onCameraClick, text, visible, isMobile,
}: {
  timer: ReturnType<typeof useTimer>
  backspaceEnabled: boolean; onToggleBackspace: () => void
  fontFamily: string; fontSize: number; onCycleFont: () => void; onCycleSize: () => void
  onCameraClick: () => void; text: string; visible: boolean; isMobile: boolean
}) {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div
      className="flex items-center justify-center gap-4 sm:gap-6 p-4 transition-opacity duration-300 shrink-0"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      <TimerButton
        display={timer.display}
        running={timer.running}
        onToggle={timer.toggle}
        onReset={timer.reset}
        onAdjust={timer.adjustMinutes}
      />

      <button
        onClick={onToggleBackspace}
        className="text-xs opacity-60 hover:opacity-100 transition-opacity"
        title="Toggle backspace"
      >
        {backspaceEnabled ? 'BS On' : 'BS Off'}
      </button>

      <button onClick={onCycleFont} className="text-xs opacity-60 hover:opacity-100 transition-opacity" title="Cycle font">
        Aa
      </button>

      <button onClick={onCycleSize} className="text-xs font-mono opacity-60 hover:opacity-100 transition-opacity" title="Cycle size">
        {fontSize}
      </button>

      {!isMobile && (
        <button onClick={onCameraClick} className="text-xs opacity-60 hover:opacity-100 transition-opacity" title="Record video">
          ⏺
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setChatOpen(o => !o)}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity"
        >
          Chat
        </button>
        {chatOpen && <ChatPopover text={text} onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  )
}

// ──── Main component ───────────────────────────────────────────────────────

export default function Freewrite() {
  const isMobile = useIsMobile()
  const [panel, setPanel] = useState<'list' | 'editor'>('list')
  const [entries, setEntries] = useState<Entry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [view, setView] = useState<'editor' | 'video-player' | 'recording'>('editor')
  const [backspaceEnabled, setBackspaceEnabled] = useState(true)
  const [fontFamily, setFontFamily] = useState(FONTS[0])
  const [fontSize, setFontSize] = useState(20)
  const [navVisible, setNavVisible] = useState(true)

  const timer = useTimer()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const placeholderRef = useRef(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)])
  const hasAutoSelected = useRef(false)

  // Load entries
  const loadEntries = useCallback(() => {
    api.list().then(setEntries).catch(() => {})
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Auto-select first entry
  useEffect(() => {
    if (hasAutoSelected.current || entries.length === 0) return
    hasAutoSelected.current = true
    selectEntry(entries[0].id)
  }, [entries])

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        if (activeIdRef.current && textareaRef.current)
          api.save(activeIdRef.current, textareaRef.current.value).catch(() => {})
      }
    }
  }, [])

  // Hide nav when timer runs (desktop only)
  useEffect(() => {
    if (!isMobile) setNavVisible(!timer.running)
  }, [timer.running, isMobile])

  // Backspace disable
  useEffect(() => {
    if (backspaceEnabled) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Backspace' || e.key === 'Delete') e.preventDefault() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [backspaceEnabled])

  // Focus editor when an entry is selected (replaces autoFocus)
  useEffect(() => {
    if (!isMobile && activeId && textareaRef.current) textareaRef.current.focus()
  }, [activeId, isMobile])

  async function selectEntry(id: string) {
    const entry = entries.find(e => e.id === id)
    activeIdRef.current = id
    setActiveId(id)
    if (entry?.is_video) {
      setView('video-player')
    } else {
      const t = await api.get(id)
      if (activeIdRef.current === id) setText(t)
      setView('editor')
    }
    if (isMobile) setPanel('editor')
  }

  function scheduleSave(id: string, value: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { api.save(id, value).catch(() => {}) }, 800)
  }

  function handleChange(value: string) {
    setText(value)
    if (activeId) {
      scheduleSave(activeId, value)
      setEntries(prev => prev.map(e =>
        e.id === activeId ? { ...e, preview: value.slice(0, 80).replace(/\n/g, ' ') } : e
      ))
    }
  }

  async function handleNew() {
    const id = await api.create()
    const newEntry: Entry = { id, created_at: new Date().toISOString(), is_video: false, preview: '' }
    setEntries(prev => [newEntry, ...prev])
    activeIdRef.current = id
    setActiveId(id)
    setText('')
    placeholderRef.current = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
    setView('editor')
    if (isMobile) setPanel('editor')
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this entry?')) return
    await api.delete(id)
    const remaining = entries.filter(en => en.id !== id)
    setEntries(remaining)
    if (activeId === id) {
      if (remaining.length > 0) selectEntry(remaining[0].id)
      else { setActiveId(null); setText(''); setView('editor'); if (isMobile) setPanel('list') }
    }
  }

  function cycleFont() {
    setFontFamily(f => FONTS[(FONTS.indexOf(f) + 1) % FONTS.length])
  }

  function cycleSize() {
    setFontSize(s => FONT_SIZES[(FONT_SIZES.indexOf(s) + 1) % FONT_SIZES.length])
  }

  // ── Panels ──────────────────────────────────────────────────────────────

  const listPanel = (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Freewrite</span>
        <button
          onClick={handleNew}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="New entry"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-4 py-12">
            <p className="text-sm text-muted-foreground text-center">No entries yet.</p>
            <button
              onClick={handleNew}
              className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
            >
              New entry
            </button>
          </div>
        ) : entries.map(entry => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => selectEntry(entry.id)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && selectEntry(entry.id)}
            className={cn(
              'px-4 py-3 border-b border-border/50 cursor-pointer flex items-start gap-2 hover:bg-muted/30 transition-colors',
              activeId === entry.id && 'bg-muted/50'
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground mb-0.5">
                {entry.is_video && '▶ '}{fmtDate(entry.created_at)}
              </p>
              <p className="text-xs text-foreground truncate leading-relaxed">
                {entry.is_video
                  ? <span className="text-muted-foreground italic">Video entry</span>
                  : entry.preview || <span className="text-muted-foreground italic">Empty</span>
                }
              </p>
            </div>
            <button
              onClick={e => handleDelete(entry.id, e)}
              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors shrink-0 mt-0.5"
              title="Delete entry"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  const editorArea = (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {isMobile && (
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
          <button
            onClick={() => setPanel('list')}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {activeId ? fmtDate(entries.find(e => e.id === activeId)?.created_at ?? '') : 'Freewrite'}
          </span>
        </div>
      )}

      {view === 'video-player' && activeId ? (
        <VideoPlayer entryId={activeId} onBack={() => setView('editor')} />
      ) : activeId ? (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          className="flex-1 w-full resize-none bg-background text-foreground placeholder:text-muted-foreground/40 outline-none"
          style={{
            padding: isMobile ? '1.25rem' : '3rem',
            fontFamily,
            fontSize,
            lineHeight: `${fontSize * 1.5}px`,
          }}
          placeholder={text.trim() === '' ? placeholderRef.current : ''}
          spellCheck
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground text-sm mb-4">No entry selected.</p>
            <button
              onClick={handleNew}
              className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
            >
              New entry
            </button>
          </div>
        </div>
      )}

      {activeId && view === 'editor' && (
        <div className="absolute bottom-16 right-6 text-[10px] font-mono text-muted-foreground/30 pointer-events-none select-none">
          {text.split(/\s+/).filter(Boolean).length} words
        </div>
      )}

      {/* Bottom nav hover zone (desktop: fades when timer runs) */}
      <div
        onMouseEnter={() => setNavVisible(true)}
        onMouseLeave={() => { if (!isMobile) setNavVisible(!timer.running) }}
      >
        <BottomNav
          timer={timer}
          backspaceEnabled={backspaceEnabled}
          onToggleBackspace={() => setBackspaceEnabled(b => !b)}
          fontFamily={fontFamily}
          fontSize={fontSize}
          onCycleFont={cycleFont}
          onCycleSize={cycleSize}
          onCameraClick={() => { if (activeId) setView('recording') }}
          text={text}
          visible={navVisible}
          isMobile={isMobile}
        />
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop layout */}
      {!isMobile && (
        <div className="flex h-full overflow-hidden">
          <div className="w-[220px] shrink-0 border-r border-border">{listPanel}</div>
          {editorArea}
        </div>
      )}

      {/* Mobile layout */}
      {isMobile && (
        <div className="h-full overflow-hidden">
          {panel === 'list' ? listPanel : editorArea}
        </div>
      )}

      {/* Video recording overlay */}
      {view === 'recording' && activeId && (
        <VideoRecorder
          entryId={activeId}
          onDone={() => { loadEntries(); setView('video-player') }}
          onClose={() => setView('editor')}
        />
      )}
    </>
  )
}
