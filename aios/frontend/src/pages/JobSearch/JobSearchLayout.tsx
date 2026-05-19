import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import ChatPanel from './ChatPanel'

export default function JobSearchLayout() {
  const [panelOpen, setPanelOpen] = useState(false)
  const location = useLocation()
  const isChat = location.pathname.endsWith('/chat')

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-hidden relative min-w-0">
        <Outlet />
        {!isChat && (
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="absolute bottom-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-80 transition-opacity"
            title="Toggle Jobby chat"
          >
            <MessageSquare size={16} />
          </button>
        )}
      </div>

      <div className={`shrink-0 border-l border-border bg-background transition-all duration-200 overflow-hidden ${panelOpen && !isChat ? 'w-80' : 'w-0'}`}>
        <div className="w-80 h-full">
          <ChatPanel onClose={() => setPanelOpen(false)} />
        </div>
      </div>
    </div>
  )
}
