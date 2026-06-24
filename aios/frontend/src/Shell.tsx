import { useEffect, useState } from 'react'
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
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
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

export default function Shell() {
  const [open, setOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

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

      {/* Main */}
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
        <Outlet />
      </main>
    </div>
  )
}
