/**
 * Shift-gate harness — mounts the REAL sale terminal (the same provider
 * stack as src/main.tsx) so the "open your shift" reminder can be driven in
 * jsdom: it must be dismissable, must never cover the toolbar, and must
 * come back the moment a real sale action is attempted without a shift.
 */
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from '../../apps/sale/src/auth/StaffAuthContext'
import { LanguageProvider } from '../../apps/sale/src/lib/i18n'
import { SaleDataProvider } from '../../apps/sale/src/lib/data'
import App from '../../apps/sale/src/App'

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <StaffAuthProvider>
      <SaleDataProvider>
        <App />
      </SaleDataProvider>
    </StaffAuthProvider>
  </LanguageProvider>,
)
