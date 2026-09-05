/**
 * Report branding + language: the shared identity every exported report
 * carries (letterhead logo, shop name, address, phone) and the language its
 * labels are written in.
 *
 * The logo is kept as an inline SVG string rather than an imported asset so
 * the esbuild-based jsdom harnesses can bundle this module without an SVG
 * loader, and it is rasterised to PNG on demand because .docx/.xlsx readers
 * cannot be relied on to render SVG.
 */

export type ReportLanguage = 'en' | 'km'

export type ReportBranding = {
  businessName: string
  locationName: string
  address: string
  phone: string
  /** The shop's own logo (Settings → Receipts). When set it replaces the
      brand mark in Word/Excel letterheads. */
  logoUrl?: string
}

export const defaultBranding: ReportBranding = {
  businessName: 'G-Cake',
  locationName: '',
  address: '',
  phone: '',
}

/** Canonical G-Cake mark (mirrors `@cake-pos/brand/logo.svg`). */
export const BRAND_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="gcake-rim" x1="24" y1="14" x2="104" y2="116" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F472B6"/>
      <stop offset="1" stop-color="#BE185D"/>
    </linearGradient>
    <linearGradient id="gcake-g" x1="64" y1="26" x2="64" y2="102" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F472B6"/>
      <stop offset="1" stop-color="#BE185D"/>
    </linearGradient>
    <radialGradient id="gcake-disc" cx="0.35" cy="0.3" r="0.9">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#FDF2F6"/>
    </radialGradient>
  </defs>
  <circle cx="64" cy="64" r="60" fill="url(#gcake-disc)"/>
  <circle cx="64" cy="64" r="57" stroke="url(#gcake-rim)" stroke-width="6"/>
  <path d="M83.28 41.02 A30 30 0 1 0 94 64 H70" stroke="url(#gcake-g)" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="104.3" cy="104.3" r="17" fill="#FFFFFF" stroke="#F472B6" stroke-width="3"/>
  <circle cx="104.3" cy="94.6" r="2.6" fill="#BE185D"/>
  <path d="M104.3 97.4 L95.1 105.6 H113.5 Z" fill="#3B82F6" stroke="#3B82F6" stroke-width="3" stroke-linejoin="round"/>
  <rect x="95.1" y="108.4" width="18.4" height="5.6" rx="2.8" fill="#3B82F6"/>
</svg>`

const customLogoCache = new Map<string, Promise<ArrayBuffer | null>>()

/**
 * Rasterise the shop's OWN logo (the one uploaded in Settings → Receipts)
 * to PNG bytes for the document letterhead. Falls back to null — and the
 * exports fall back to the brand mark / a text letterhead — when the image
 * cannot be loaded or the canvas is unavailable (jsdom, headless browsers).
 */
export function customLogoPng(
  logoUrl: string,
  size = 128,
): Promise<ArrayBuffer | null> {
  const cached = customLogoCache.get(logoUrl)
  if (cached) return cached
  const pending = new Promise<ArrayBuffer | null>((resolve) => {
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext?.('2d')
      if (!context || typeof canvas.toDataURL !== 'function') {
        resolve(null)
        return
      }
      canvas.width = size
      canvas.height = size
      const image = new Image()
      image.crossOrigin = 'anonymous'
      const done = (value: ArrayBuffer | null) => resolve(value)
      image.onload = () => {
        try {
          const scale = Math.min(size / image.width, size / image.height)
          const width = Math.max(1, Math.round(image.width * scale))
          const height = Math.max(1, Math.round(image.height * scale))
          context.clearRect(0, 0, size, size)
          context.drawImage(
            image,
            (size - width) / 2,
            (size - height) / 2,
            width,
            height,
          )
          const dataUrl = canvas.toDataURL('image/png')
          const base64 = dataUrl.split(',')[1] ?? ''
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
          }
          done(bytes.buffer)
        } catch {
          done(null)
        }
      }
      image.onerror = () => done(null)
      image.src = logoUrl
    } catch {
      resolve(null)
    }
  })
  customLogoCache.set(logoUrl, pending)
  return pending
}

let logoCache: ArrayBuffer | null | undefined

/**
 * Rasterise the brand mark to PNG bytes for the document letterhead.
 * Returns null (and the exports fall back to a text-only letterhead) when
 * canvas/Image are unavailable — jsdom, locked-down webviews, headless
 * environments — so a missing logo can never break a download.
 */
export async function brandLogoPng(size = 256): Promise<ArrayBuffer | null> {
  if (logoCache !== undefined) return logoCache
  logoCache = await new Promise<ArrayBuffer | null>((resolve) => {
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext?.('2d')
      if (!context || typeof canvas.toDataURL !== 'function') {
        resolve(null)
        return
      }
      canvas.width = size
      canvas.height = size
      const svg = new Blob([BRAND_LOGO_SVG], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(svg)
      const image = new Image()
      const done = (value: ArrayBuffer | null) => {
        URL.revokeObjectURL(url)
        resolve(value)
      }
      image.onload = () => {
        try {
          context.drawImage(image, 0, 0, size, size)
          const dataUrl = canvas.toDataURL('image/png')
          const base64 = dataUrl.split(',')[1] ?? ''
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
          }
          done(bytes.buffer)
        } catch {
          done(null)
        }
      }
      image.onerror = () => done(null)
      image.src = url
    } catch {
      resolve(null)
    }
  })
  return logoCache
}

type Dictionary = {
  reportBy: string
  period: string
  generated: string
  allDates: string
  present: string
  records: string
  filters: string
  noFilters: string
  total: string
  page: string
  confidential: string
  /** Khmer uses "៖" (no leading space) where English uses ": ". */
  colon: string
  noProductSales: string
}

const DICTIONARIES: Record<ReportLanguage, Dictionary> = {
  en: {
    reportBy: 'Report prepared by',
    period: 'Reporting period',
    generated: 'Generated',
    allDates: 'all dates',
    present: 'today',
    records: 'Records',
    filters: 'Filters',
    noFilters: 'None (full period)',
    total: 'Total',
    page: 'Page',
    confidential: 'Internal management report',
    colon: ': ',
    noProductSales: 'No completed product sales',
  },
  km: {
    reportBy: 'រៀបចំដោយ',
    period: 'រយៈពេលរាយការណ៍',
    generated: 'បង្កើតនៅ',
    allDates: 'រាល់កាលបរិច្ឆេទ',
    present: 'បច្ចុប្បន្ន',
    records: 'ចំនួនកំណត់ត្រា',
    filters: 'តម្រង',
    noFilters: 'គ្មាន (ពេញរយៈពេល)',
    total: 'សរុប',
    page: 'ទំព័រ',
    confidential: 'របាយការណ៍ខាងក្នុងសម្រាប់ការគ្រប់គ្រង',
    colon: '៖ ',
    noProductSales: 'គ្មានការលក់ផលិតផលដែលបានបញ្ចប់',
  },
}

export const reportStrings = (language: ReportLanguage): Dictionary =>
  DICTIONARIES[language] ?? DICTIONARIES.en

/** Khmer needs its own font stack in Word or the script renders as boxes. */
export const REPORT_FONT = {
  ascii: 'Kantumruy Pro',
  hAnsi: 'Kantumruy Pro',
  eastAsia: 'Kantumruy Pro',
}
