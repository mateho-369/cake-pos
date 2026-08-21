import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CustomerApp from './CustomerApp'
import { LanguageProvider } from './lib/i18n'
import './base.css'
import './customer.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <CustomerApp />
    </LanguageProvider>
  </StrictMode>,
)
