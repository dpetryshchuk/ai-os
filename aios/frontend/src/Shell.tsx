import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  BookOpen,
  BriefcaseIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Home,
  Lightbulb,
  Megaphone,
  Menu,
  MessageSquare,
  PenLine,
  Pin,
  PinOff,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from './lib/utils'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

const IS_OKF = typeof window !== 'undefined' && window.location.hostname.includes('onekeyflow')

type WorkflowSection = {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  subnav?: Array<{ label: string; path: string; icon: React.ComponentType<{ className?: string }> }>
}

const WORKFLOWS: WorkflowSection[] = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Events', path: '/events', icon: Activity },
  { label: 'Ideas', path: '/ideas', icon: Lightbulb },
  {
    label: 'Job Search',
    path: '/jobsearch',
    icon: BriefcaseIcon,
    subnav: [
      { label: 'Chat', path: '/jobsearch/chat', icon: MessageSquare },
      { label: 'Pipeline', path: '/jobsearch/pipeline', icon: Users },
      { label: 'Leads', path: '/jobsearch/leads', icon: Target },
      { label: 'Applications', path: '/jobsearch/applications', icon: FileText },
      { label: 'Notes', path: '/jobsearch/notes', icon: BookOpen },
      { label: 'Retro', path: '/jobsearch/retro', icon: TrendingUp },
    ],
  },
  {
    label: 'Writing',
    path: '/writing',
    icon: PenLine,
    subnav: [
      { label: 'Essays', path: '/writing', icon: FileText },
      { label: 'Freewrite', path: '/writing/freewrite', icon: Zap },
    ],
  },
  { label: 'Daily Log', path: '/daily-log', icon: CalendarDays },
  { label: 'Look', path: '/look', icon: Sparkles },
]

const BUSINESS: WorkflowSection[] = [
  { label: 'Proposals', path: '/proposals', icon: ClipboardList },
  { label: 'Revenue', path: '/revenue', icon: TrendingUp },
  { label: 'Outreach', path: '/outreach', icon: Megaphone },
  { label: 'Events', path: '/okf-events', icon: Activity },
]

const COLLAPSED_KEY = 'aios:sidebar-collapsed'

function NavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: WorkflowSection
  collapsed: boolean
  onNavigate: () => void
}) {
  const location = useLocation()
  const isActive = item.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(item.path)

  return (
    <div>
      <NavLink
        to={item.path}
        end={item.path === '/'}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-md text-sm transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-1.5',
            isActive
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )
        }
      >
        <item.icon className="size-4 shrink-0" />
        {!collapsed && item.label}
      </NavLink>
      {!collapsed && item.subnav && isActive && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {item.subnav.map((sub) => (
            <NavLink
              key={sub.path}
              to={sub.path}
              end={sub.path === '/writing'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )
              }
            >
              <sub.icon className="size-3.5 shrink-0" />
              {sub.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

const PERSONAL_SHORTCUTS = [
  { key: 'Option+1', action: 'Home' },
  { key: 'Option+2', action: 'Events' },
  { key: 'Option+3', action: 'Ideas' },
  { key: 'Option+4', action: 'Job Search' },
  { key: 'Option+5', action: 'Writing' },
  { key: 'Option+6', action: 'Daily Log' },
  { key: 'Option+7', action: 'Look' },
  { key: 'Option+C', action: 'Chat with Ima' },
  { key: 'Option+M', action: 'Voice input (mic)' },
  { key: ']', action: 'Toggle sidebar' },
  { key: '?', action: 'Show this help' },
]

const BUSINESS_SHORTCUTS = [
  { key: 'Option+1', action: 'Proposals' },
  { key: 'Option+2', action: 'Revenue' },
  { key: 'Option+3', action: 'Outreach' },
  { key: 'Option+4', action: 'Events' },
  { key: 'Option+C', action: 'Proposals' },
  { key: 'Option+M', action: 'Voice input (mic)' },
  { key: ']', action: 'Toggle sidebar' },
  { key: '?', action: 'Show this help' },
]

function ShortcutHelperModal({ onClose, isOkf }: { onClose: () => void; isOkf: boolean }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const shortcuts = isOkf ? BUSINESS_SHORTCUTS : PERSONAL_SHORTCUTS

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-background border border-border rounded-xl shadow-xl p-6 w-80 max-w-[90vw]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold tracking-tight">Keyboard Shortcuts</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {shortcuts.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{action}</span>
              <kbd className="px-2 py-0.5 text-xs rounded border border-border bg-muted font-mono">{key}</kbd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-muted-foreground text-center">Press ? or Esc to close</p>
      </div>
    </div>
  )
}

// ── Ima global chat panel ──────────────────────────────────────────────────

const IMA_STREAM_URL = '/api/jobsearch/agents/stream'

const IMA_THINKING = ['Thinking...', 'Working...', 'Looking it up...', 'On it...']

interface ImaMsg {
  id: string
  role: 'user' | 'agent'
  text: string
  thinking?: boolean
}

function ImaMsgBubble({ msg }: { msg: ImaMsg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-muted rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed border border-border bg-card">
        {msg.thinking ? (
          <span className="text-muted-foreground animate-pulse text-xs">{msg.text}</span>
        ) : (
          <div
            className="prose prose-sm prose-neutral max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.text) as string) }}
          />
        )}
      </div>
    </div>
  )
}

function ImaPanel({ onClose, onTogglePin, pinned }: { onClose: () => void; onTogglePin: () => void; pinned: boolean }) {
  const [messages, setMessages] = useState<ImaMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<{ role: string; content: string }[]>([])
  const thinkingIdxRef = useRef(0)

  const updateMsg = useCallback((id: string, up: (m: ImaMsg) => ImaMsg) => {
    setMessages(prev => prev.map(m => m.id === id ? up(m) : m))
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    const uid = `u${Date.now()}`, aid = `a${Date.now()}`
    setMessages(prev => [...prev,
      { id: uid, role: 'user', text },
      { id: aid, role: 'agent', text: IMA_THINKING[0], thinking: true },
    ])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setStreaming(true)
    const iv = setInterval(() => {
      thinkingIdxRef.current = (thinkingIdxRef.current + 1) % IMA_THINKING.length
      updateMsg(aid, m => m.thinking ? { ...m, text: IMA_THINKING[thinkingIdxRef.current] } : m)
    }, 700)
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    try {
      const res = await fetch(IMA_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
      })
      clearInterval(iv)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let textContent = '', buffer = '', started = false
      const reader = res.body!.getReader(), dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        const parts = buffer.split('\n\n'); buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const t = line.slice(6).trim()
          if (!t || t === '[DONE]') continue
          let chunk: { type?: string; payload?: Record<string, unknown> }
          try { chunk = JSON.parse(t) } catch { continue }
          if (chunk.type === 'text-delta' && chunk.payload?.text) {
            textContent += chunk.payload.text as string
            if (!started) { started = true; updateMsg(aid, m => ({ ...m, text: textContent, thinking: false })) }
            else updateMsg(aid, m => ({ ...m, text: textContent }))
          }
        }
      }
      updateMsg(aid, m => m.thinking ? { ...m, text: textContent || '...', thinking: false } : m)
      if (textContent) historyRef.current = [...historyRef.current, { role: 'assistant', content: textContent }]
    } catch (err) {
      clearInterval(iv)
      const msg = err instanceof Error ? err.message : 'Error'
      updateMsg(aid, m => ({ ...m, text: `Error: ${msg}`, thinking: false }))
      historyRef.current = historyRef.current.slice(0, -1)
    } finally { setStreaming(false) }
  }, [input, streaming, updateMsg])

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-sm font-semibold tracking-tight">Ima</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePin}
            title={pinned ? 'Unpin' : 'Pin to side'}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <button
            onClick={onClose}
            title="Close Ima"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-2">
            <div className="size-8 rounded-full bg-foreground/10 flex items-center justify-center">
              <div className="size-2.5 rounded-full bg-foreground/60" />
            </div>
            <p className="text-sm font-medium">Ask Ima anything</p>
            <p className="text-xs text-muted-foreground">Accessible from every page</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map(m => <ImaMsgBubble key={m.id} msg={m} />)}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2 shrink-0">
        <div className="flex gap-1.5 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); adjustHeight() }}
            onKeyDown={handleKey}
            placeholder="Ask Ima..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/30 min-h-[36px] max-h-[160px] transition-all"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="shrink-0 flex items-center justify-center size-9 rounded-lg bg-foreground text-background disabled:opacity-40 hover:opacity-80 transition-opacity"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Shell() {
  const [open, setOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [imaOpen, setImaOpen] = useState(false)
  const [imaPinned, setImaPinned] = useState(false)

  useEffect(() => {
    if (IS_OKF) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  })

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useKeyboardShortcuts({
    onToggleSidebar: () => setCollapsed(c => !c),
    onShowShortcuts: () => setShowShortcuts(s => !s),
    onToggleIma: () => setImaOpen(o => !o),
    isOkf: IS_OKF,
  })

  return (
    <div className="flex h-screen overflow-hidden">
      {showShortcuts && <ShortcutHelperModal onClose={() => setShowShortcuts(false)} isOkf={IS_OKF} />}

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close menu"
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(false)}
        />
      )}

      {/* Ima drawer backdrop (mobile/narrow) */}
      {imaOpen && !imaPinned && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setImaOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed (and collapsible) column on desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 shrink-0 border-r border-border bg-background flex flex-col transition-all duration-200',
          'md:relative md:translate-x-0',
          collapsed ? 'md:w-14' : 'md:w-52',
          'w-52',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className={cn(
          'border-b border-border flex items-center',
          collapsed ? 'p-2 justify-center' : 'p-4 justify-between',
        )}>
          {!collapsed && <span className="text-sm font-semibold tracking-tight">AI OS</span>}
          <button
            className="hidden md:inline-flex p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {(IS_OKF ? BUSINESS : WORKFLOWS).map((item) => (
            <NavItem key={item.path} item={item} collapsed={collapsed} onNavigate={() => setOpen(false)} />
          ))}
        </nav>
      </aside>

      {/* Main content + right panel wrapper */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-background md:hidden">
            <button
              onClick={() => setOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <span className="text-sm font-semibold tracking-tight">AI OS</span>
          </div>

          {/* Desktop top bar with Ima trigger */}
          <div className="hidden md:flex items-center justify-end px-4 py-1.5 border-b border-border bg-background shrink-0">
            <button
              onClick={() => setImaOpen(o => !o)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                imaOpen
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-border',
              )}
            >
              <div className="size-1.5 rounded-full bg-green-400" />
              Ima
            </button>
          </div>

          <Outlet />
        </main>

        {/* Ima panel — pinned (in-flow) */}
        {imaOpen && imaPinned && (
          <div className="w-[380px] shrink-0 flex flex-col">
            <ImaPanel
              onClose={() => { setImaOpen(false); setImaPinned(false) }}
              onTogglePin={() => setImaPinned(false)}
              pinned={true}
            />
          </div>
        )}
      </div>

      {/* Ima panel — drawer (fixed overlay) */}
      {imaOpen && !imaPinned && (
        <div className="fixed right-0 top-0 bottom-0 z-50 w-[380px] shadow-2xl flex flex-col">
          <ImaPanel
            onClose={() => setImaOpen(false)}
            onTogglePin={() => setImaPinned(true)}
            pinned={false}
          />
        </div>
      )}
    </div>
  )
}
