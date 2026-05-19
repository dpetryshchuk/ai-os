import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, ClipboardList, Menu, Megaphone, TrendingUp, X } from 'lucide-react'
import { cn } from './lib/utils'

type NavSection = {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  subnav?: Array<{ label: string; path: string; icon: React.ComponentType<{ className?: string }> }>
}

const NAV: NavSection[] = [
  { label: 'Proposals', path: '/proposals', icon: ClipboardList },
  { label: 'Events', path: '/events', icon: Activity },
  { label: 'Outreach', path: '/outreach', icon: Megaphone },
  { label: 'Revenue', path: '/revenue', icon: TrendingUp },
]

function NavItem({ item, onNavigate }: { item: NavSection; onNavigate: () => void }) {
  const location = useLocation()
  const isActive = location.pathname.startsWith(item.path)

  return (
    <div>
      <NavLink
        to={item.path}
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
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-52 shrink-0 border-r border-border bg-background flex flex-col transition-transform duration-200',
          'md:relative md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">OneKeyFlow</span>
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavItem key={item.path} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-background md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight">OneKeyFlow</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
