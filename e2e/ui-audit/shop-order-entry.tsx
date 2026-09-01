/**
 * Shop (Telegram Mini App) harness — mounts the REAL customer storefront so
 * the per-line order note can be typed and the submitted payload inspected.
 */
import { createRoot } from 'react-dom/client'
import CustomerApp from '../../apps/shop/src/CustomerApp'
import { LanguageProvider } from '../../apps/shop/src/lib/i18n'

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <CustomerApp />
  </LanguageProvider>,
)
