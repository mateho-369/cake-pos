import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CustomerApp from './CustomerApp'
import { prepareTelegramChrome, getTelegramWebApp } from '@cake-pos/telegram'
import { LanguageProvider } from './lib/i18n'
import './base.css'
import './customer.css'

// Signal readiness to the Telegram host as early as possible — before React
// mounts — so the Mini App expands instead of flashing compact. The identity
// hook re-asserts it plus fullscreen/theme once mounted.
prepareTelegramChrome(getTelegramWebApp())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <CustomerApp />
    </LanguageProvider>
  </StrictMode>,
)
