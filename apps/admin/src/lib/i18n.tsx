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
type TranslationValue = string | Record<string, unknown>
export type TranslationFunction = (
  key: string,
  variables?: Record<string, string | number>,
) => string
type Dictionary = Record<string, TranslationValue>

type TranslationContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: TranslationFunction
}

const LanguageContext = createContext<TranslationContextValue | null>(null)
const dictionaries: Record<Language, Dictionary> = { en, km }
const LANGUAGE_STORAGE_KEY = 'atelier.language'

function readLanguage(): Language {
  try {
    return sessionStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'km'
  } catch {
    return 'km'
  }
}

function lookup(dictionary: Dictionary, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<TranslationValue | undefined>((current, part) => {
      if (!current || typeof current === 'string') return undefined
      return current[part] as TranslationValue | undefined
    }, dictionary)
  return typeof value === 'string' ? value : undefined
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readLanguage)

  useEffect(() => {
    try {
      sessionStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      // Session storage can be unavailable in privacy-restricted webviews.
    }
  }, [language])

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, variables) => {
        const translated =
          lookup(dictionaries[language], key) ??
          lookup(dictionaries.en, key) ??
          key
        return variables
          ? translated.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
              String(variables[name] ?? `{{${name}}}`),
            )
          : translated
      },
    }),
    [language],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(LanguageContext)
  if (!context)
    throw new Error('useTranslation must be used within LanguageProvider')
  return context
}

export function translateCategory(t: TranslationFunction, category: string) {
  const keys: Record<string, string> = {
    'Signature Cakes': 'catalog.signature',
    Signature: 'catalog.signature',
    'Birthday Cakes': 'catalog.birthday',
    Cheesecakes: 'catalog.cheesecakes',
    'Whole cakes': 'sale.wholeCakes',
    'Mini cakes': 'sale.miniCakes',
    'Mini Cakes': 'catalog.mini',
    Slices: 'sale.slices',
    Cupcakes: 'sale.cupcakes',
    Drinks: 'sale.drinks',
    Beverages: 'catalog.beverages',
  }
  return keys[category] ? t(keys[category]) : category
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
