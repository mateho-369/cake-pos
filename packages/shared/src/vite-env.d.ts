/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_ADMIN_ORIGIN: string
  readonly VITE_SALE_ORIGIN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
