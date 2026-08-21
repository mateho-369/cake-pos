import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from './auth/StaffAuthContext'
import { LanguageProvider } from './lib/i18n'
import { AdminDataProvider } from './lib/data'
import App from './App'
import './index.css'

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
