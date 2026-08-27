/**
 * Locale-key audit — extracts every t('…') call in the admin/sale/shop apps
 * and verifies the key exists in BOTH en.json and km.json, and that the
 * {{placeholder}} sets match between the two languages.
 *
 * Usage: node e2e/locale-audit.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['admin', 'sale', 'shop']

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full)
  }
  return out
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = String(v)
  }
  return out
}

const placeholders = (value) =>
  [...String(value).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

let problems = 0
for (const app of APPS) {
  const appDir = join(root, 'apps', app, 'src')
  const en = flatten(JSON.parse(readFileSync(join(appDir, 'locales/en.json'), 'utf8')))
  const km = flatten(JSON.parse(readFileSync(join(appDir, 'locales/km.json'), 'utf8')))

  const usedKeys = new Map() // key -> [files]
  const dynamicKeys = new Map() // prefix -> [files]
  const namespaces = new Set(Object.keys(JSON.parse(readFileSync(join(appDir, 'locales/en.json'), 'utf8'))))
  for (const file of walk(appDir)) {
    const src = readFileSync(file, 'utf8')
    const rel = file.slice(appDir.length + 1)
    // Static keys: t('a.b.c') / t("a.b.c")
    for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
      const key = m[1]
      if (!usedKeys.has(key)) usedKeys.set(key, [])
      usedKeys.get(key).push(rel)
    }
    // Keys referenced indirectly (t(item.label), t(group.title), …): any
    // dotted string literal whose first segment is a known locale namespace.
    for (const m of src.matchAll(/['"](([a-zA-Z][a-zA-Z0-9]*)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*)['"]/g)) {
      const key = m[1]
      if (!namespaces.has(m[2])) continue
      if (!usedKeys.has(key)) usedKeys.set(key, [])
      usedKeys.get(key).push(rel)
    }
    // Template-literal keys: t(`prefix.${x}`) or t(`prefix.${x}.suffix`)
    for (const m of src.matchAll(/\bt\(\s*`([^`$]*)\$\{[^`]*\}([^`]*)`/g)) {
      const prefix = `${m[1]}*${m[2]}`
      if (!dynamicKeys.has(prefix)) dynamicKeys.set(prefix, [])
      dynamicKeys.get(prefix).push(rel)
    }
  }

  console.log(`\n########## ${app} — ${usedKeys.size} static keys, ${dynamicKeys.size} dynamic patterns ##########`)
  for (const [key, files] of [...usedKeys.entries()].sort()) {
    const missing = []
    if (!(key in en)) missing.push('en')
    if (!(key in km)) missing.push('km')
    if (missing.length) {
      problems++
      console.log(`MISSING [${missing.join('+')}] ${key}   (${[...new Set(files)].join(', ')})`)
      continue
    }
    const pe = placeholders(en[key])
    const pk = placeholders(km[key])
    if (pe.join(',') !== pk.join(',')) {
      problems++
      console.log(`PLACEHOLDER MISMATCH ${key}  en:{${pe.join(',')}} km:{${pk.join(',')}}`)
    }
  }
  // Dynamic keys: verify every key in the dictionaries matching the prefix
  // pattern exists in BOTH languages with matching placeholders.
  for (const [pattern] of dynamicKeys) {
    const [pre, post = ''] = pattern.split('*')
    const re = new RegExp(`^${pre.replace(/\./g, '\\.')}[a-zA-Z0-9_]+${post.replace(/\./g, '\\.')}$`)
    const candidates = new Set([...Object.keys(en), ...Object.keys(km)].filter((k) => re.test(k)))
    if (!candidates.size) {
      problems++
      console.log(`DYNAMIC PATTERN HAS NO MATCHING KEYS: ${pattern}`)
    }
    for (const key of candidates) {
      if (!(key in en) || !(key in km)) {
        problems++
        console.log(`MISSING [${!(key in en) ? 'en' : 'km'}] ${key}  (dynamic pattern ${pattern})`)
      }
    }
  }
  // Placeholder consistency across the whole dictionary (catches keys only
  // reachable via dynamic patterns too).
  for (const key of Object.keys(en)) {
    if (!(key in km)) { problems++; console.log(`MISSING [km] ${key} (dictionary scan)`); continue }
    const pe = placeholders(en[key]); const pk = placeholders(km[key])
    if (pe.join(',') !== pk.join(',')) {
      problems++
      console.log(`PLACEHOLDER MISMATCH ${key}  en:{${pe.join(',')}} km:{${pk.join(',')}}`)
    }
  }
  for (const key of Object.keys(km)) {
    if (!(key in en)) { problems++; console.log(`MISSING [en] ${key} (dictionary scan)`) }
  }
}

console.log(`\n${problems === 0 ? 'ALL LOCALE KEYS OK' : `${problems} LOCALE PROBLEM(S) FOUND`}`)
process.exit(problems === 0 ? 0 : 1)
