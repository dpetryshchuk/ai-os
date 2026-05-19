import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './Shell'
import Home from './pages/Home'
import EventsPage from './pages/Events'
import Chat from './pages/JobSearch/Chat'
import Pipeline from './pages/JobSearch/Pipeline'
import Leads from './pages/JobSearch/Leads'
import Applications from './pages/JobSearch/Applications'
import Notes from './pages/JobSearch/Notes'
import Retro from './pages/JobSearch/Retro'
import Essays from './pages/Writing/Essays'
import Freewrite from './pages/Writing/Freewrite'
import DailyLog from './pages/DailyLog'
import Proposals from './pages/Proposals'
import Ideas from './pages/Ideas'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="proposals" element={<Proposals />} />
          <Route path="jobsearch">
            <Route index element={<Navigate to="chat" replace />} />
            <Route path="chat" element={<Chat />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="leads" element={<Leads />} />
            <Route path="applications" element={<Applications />} />
            <Route path="notes" element={<Notes />} />
            <Route path="retro" element={<Retro />} />
          </Route>
          <Route path="writing">
            <Route index element={<Essays />} />
            <Route path="freewrite" element={<Freewrite />} />
          </Route>
          <Route path="daily-log" element={<DailyLog />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
