import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './modern-app.css'
import './modern-investment.css'
import './modern-admin.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
