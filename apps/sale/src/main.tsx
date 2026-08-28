import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from './auth/StaffAuthContext'
import { LanguageProvider } from './lib/i18n'
import { SaleDataProvider } from './lib/data'
import App from './App'
import { prepareTelegramChrome, getTelegramWebApp } from '@cake-pos/telegram'
import './index.css'
import './customer.css'
import './customer-display.css'

// Signal readiness to the Telegram host before React mounts so the Mini App
// expands immediately instead of flashing compact. The shared hook re-asserts
// ready/expand plus true fullscreen once mounted.
prepareTelegramChrome(getTelegramWebApp())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <StaffAuthProvider>
        <SaleDataProvider>
          <App />
        </SaleDataProvider>
      </StaffAuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
