/**
 * Audit entry — mounts the REAL admin app (same provider stack as
 * src/main.tsx, minus StrictMode and the CSS import) so the harness can
 * click through every page against the mocked API.
 */
import { createRoot } from 'react-dom/client'
import { StaffAuthProvider } from '../../apps/admin/src/auth/StaffAuthContext'
import { LanguageProvider } from '../../apps/admin/src/lib/i18n'
import { AdminDataProvider } from '../../apps/admin/src/lib/data'
import App from '../../apps/admin/src/App'

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <StaffAuthProvider>
      <AdminDataProvider>
        <App />
      </AdminDataProvider>
    </StaffAuthProvider>
  </LanguageProvider>,
)
