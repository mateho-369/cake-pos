/**
 * Sale-side audit entry — mounts the REAL sale provider stack (same as
 * src/main.tsx, minus StrictMode, the Telegram chrome and the CSS imports)
 * around the REAL Quick Add modal, so the harness can drive the category
 * picker against a mocked API.
 */
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from '../../apps/sale/src/auth/StaffAuthContext'
import { LanguageProvider } from '../../apps/sale/src/lib/i18n'
import { SaleDataProvider } from '../../apps/sale/src/lib/data'
import QuickAddModal from '../../apps/sale/src/components/QuickAddModal'
import type { Product } from '../../apps/sale/src/data'

declare global {
  interface Window {
    __quickAddResult?: Product | null
  }
}

function Harness() {
  return (
    <LanguageProvider>
      <StaffAuthProvider>
        <SaleDataProvider>
          <QuickAddModal
            open
            onClose={() => {}}
            onAdd={(product) => {
              window.__quickAddResult = product
            }}
            shelfLifeDays={3}
          />
        </SaleDataProvider>
      </StaffAuthProvider>
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
