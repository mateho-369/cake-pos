import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@bloom/shared/index.css'
import './sale.css'
import App from './App'
import { initTelegram } from './lib/telegram'

initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
