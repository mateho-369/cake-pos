import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from './auth/StaffAuthContext'
import { LanguageProvider } from './lib/i18n'
import { AdminDataProvider } from './lib/data'
import App from './App'
import './index.css'
import { prepareTelegramChrome, getTelegramWebApp } from '@cake-pos/telegram'

// Signal readiness to the Telegram host before React mounts so the Mini App
// never shows Telegram's loading shimmer over an already-painted console,
// and so the --tg-inset-* custom properties exist for the very first paint
// (the top bar must clear Telegram's back/close controls immediately).
prepareTelegramChrome(getTelegramWebApp())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <StaffAuthProvider>
        <AdminDataProvider>
          <App />
        </AdminDataProvider>
      </StaffAuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
