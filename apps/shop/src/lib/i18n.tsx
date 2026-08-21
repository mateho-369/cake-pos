import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import en from '../locales/en.json'
import km from '../locales/km.json'
export type Language = 'en' | 'km'
type Dict = Record<string, unknown>
const C = createContext<{
  language: Language
  setLanguage: (v: Language) => void
  t: (k: string, v?: Record<string, string | number>) => string
} | null>(null)
const lookup = (d: Dict, k: string): string | undefined => {
  const x = k
    .split('.')
    .reduce<unknown>(
      (a, p) => (a && typeof a === 'object' ? (a as Dict)[p] : undefined),
      d,
    )
  return typeof x === 'string' ? x : undefined
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return sessionStorage.getItem('shop.language') === 'en' ? 'en' : 'km'
    } catch {
      return 'km'
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem('shop.language', language)
    } catch {}
  }, [language])
  const t = (k: string, v?: Record<string, string | number>) => {
    const s = lookup(language === 'km' ? km : en, k) || lookup(en, k) || k
    return v
      ? s.replace(/\{\{(\w+)\}\}/g, (_, n) => String(v[n] ?? `{{${n}}}`))
      : s
  }
  return (
    <C.Provider value={{ language, setLanguage, t }}>{children}</C.Provider>
  )
}
export function useTranslation() {
  const c = useContext(C)
  if (!c) throw new Error('useTranslation must be used within LanguageProvider')
  return c
}
export function LanguageToggle() {
  const { language, setLanguage, t } = useTranslation()
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label={t('language.choose')}
    >
      <button
        type="button"
        className={language === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={language === 'km' ? 'active' : ''}
        onClick={() => setLanguage('km')}
      >
        ខ្មែរ
      </button>
    </div>
  )
}
