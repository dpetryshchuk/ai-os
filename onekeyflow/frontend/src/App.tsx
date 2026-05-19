import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './Shell'
import Proposals from './pages/Proposals'
import Events from './pages/Events'
import Outreach from './pages/Outreach'
import Revenue from './pages/Revenue'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="proposals" replace />} />
          <Route path="proposals" element={<Proposals />} />
          <Route path="events" element={<Events />} />
          <Route path="outreach" element={<Outreach />} />
          <Route path="revenue" element={<Revenue />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
