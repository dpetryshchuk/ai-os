import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Proposals from './pages/Proposals'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Proposals />
  </StrictMode>,
)
