import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { LanguageProvider } from './lib/i18n'
import { SaleDataProvider } from './lib/data'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <SaleDataProvider>
          <App />
        </SaleDataProvider>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
