import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  BookOpen,
  BriefcaseIcon,
  CalendarDays,
  FileText,
  Home,
  Lightbulb,
  Menu,
  MessageSquare,
  PenLine,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { cn } from './lib/utils'

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
]

function NavItem({
  item,
  onNavigate,
}: {
  item: WorkflowSection
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
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )
        }
      >
        <item.icon className="size-4 shrink-0" />
        {item.label}
      </NavLink>
      {item.subnav && isActive && (
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed column on desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-52 shrink-0 border-r border-border bg-background flex flex-col transition-transform duration-200',
          'md:relative md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">AI OS</span>
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {WORKFLOWS.map((item) => (
            <NavItem key={item.path} item={item} onNavigate={() => setOpen(false)} />
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
