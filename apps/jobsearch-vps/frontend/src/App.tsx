import { Routes, Route } from 'react-router-dom'
import { Sidebar, BottomNav } from '@/components/Nav'
import Chat from '@/pages/Chat'
import Pipeline from '@/pages/Pipeline'
import Retro from '@/pages/Retro'
import Notes from '@/pages/Notes'
import Leads from '@/pages/Leads'
import Applications from '@/pages/Applications'
import Content from '@/pages/Content'
import Usage from '@/pages/Usage'
import Schema from '@/pages/Schema'

export default function App() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 md:ml-56 flex flex-col min-h-screen pb-20 md:pb-0" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/retro" element={<Retro />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/content" element={<Content />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/schema" element={<Schema />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
