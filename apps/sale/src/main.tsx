import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from './auth/StaffAuthContext'
import { LanguageProvider } from './lib/i18n'
import { SaleDataProvider } from './lib/data'
import App from './App'
import './index.css'
import './customer.css'
import './customer-display.css'

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
