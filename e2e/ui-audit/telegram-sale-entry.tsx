/**
 * Sale terminal harness for the Telegram Mini App chrome audit — the same
 * provider stack as src/main.tsx, mounted inside a stubbed Telegram client
 * so the fullscreen behaviour (insets, native back button, closing
 * confirmation) can be driven in jsdom.
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
