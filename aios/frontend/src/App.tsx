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
import JobSearchLayout from './pages/JobSearch/JobSearchLayout'
import Essays from './pages/Writing/Essays'
import Freewrite from './pages/Writing/Freewrite'
import DailyLog from './pages/DailyLog'
import Ideas from './pages/Ideas'
import Look from './pages/Look'
import Vault from './pages/Vault'
import Proposals from './pages/Business/Proposals'
import Revenue from './pages/Business/Revenue'
import Outreach from './pages/Business/Outreach'
import OkfEvents from './pages/Business/OkfEvents'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="jobsearch" element={<JobSearchLayout />}>
            <Route index element={<Navigate to="pipeline" replace />} />
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
          <Route path="look" element={<Look />} />
          <Route path="vault" element={<Vault />} />
          <Route path="proposals" element={<Proposals />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="outreach" element={<Outreach />} />
          <Route path="okf-events" element={<OkfEvents />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
