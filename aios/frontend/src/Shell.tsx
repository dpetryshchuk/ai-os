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

export default function Shell() {
  const [open, setOpen] = useState(false)

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

  return (
    <div className="flex h-screen overflow-hidden">
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
