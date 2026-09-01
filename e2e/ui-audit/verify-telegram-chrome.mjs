/**
 * Telegram Mini App chrome audit — the staff surfaces (sale terminal and
 * admin console) opened from the staff bot.
 *
 * The report this exists for: in fullscreen, Telegram floats its OWN
 * back/close pill over the top of the page, and both apps drew their header
 * underneath it — the cashier's taps landed on Telegram's controls instead
 * of the terminal's. Two things have to be true, on both surfaces:
 *
 *   1. The insets Telegram reports are published as --tg-inset-* on <html>,
 *      and the top one is the DEVICE inset PLUS Telegram's chrome (the
 *      content inset is measured inside the safe area, so max() of the two
 *      is exactly how the header ended up under the back button).
 *   2. The apps behave like Mini Apps: the root carries .telegram-app (so
 *      the padding rules apply), vertical swipe-to-minimise is off, the
 *      NATIVE back button drives the topmost layer, and a cart in progress
 *      arms the closing confirmation.
 *
 * Usage: node e2e/ui-audit/verify-telegram-chrome.mjs
 */
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import * as fx from './fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/ui-audit/out')
mkdirSync(outDir, { recursive: true })

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(
    `${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`,
  )
  if (!cond) failures++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bundleEntry = async (name) => {
  const outfile = join(outDir, `${name}.cjs`)
  await build({
    entryPoints: [join(root, `e2e/ui-audit/${name}.tsx`)],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    outfile,
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
    },
    jsx: 'automatic',
    logLevel: 'silent',
  })
  return outfile
}

/**
 * A Telegram client in FULLSCREEN on a notched phone: 59px of device status
 * bar, and Telegram's back/close pill drawn in the 46px below it.
 */
const telegramStub = () => {
  const calls = {
    ready: 0,
    expand: 0,
    fullscreen: 0,
    swipesDisabled: 0,
    confirmOn: 0,
    confirmOff: 0,
  }
  const back = { visible: false, handler: null, shows: 0, hides: 0 }
  const webApp = {
    platform: 'ios',
    version: '8.0',
    initData: '',
    isFullscreen: true,
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
    ready: () => calls.ready++,
    expand: () => calls.expand++,
    requestFullscreen: () => calls.fullscreen++,
    disableVerticalSwipes: () => calls.swipesDisabled++,
    enableClosingConfirmation: () => calls.confirmOn++,
    disableClosingConfirmation: () => calls.confirmOff++,
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    isVersionAtLeast: () => true,
    onEvent: () => {},
    offEvent: () => {},
    BackButton: {
      show: () => {
        back.visible = true
        back.shows++
      },
      hide: () => {
        back.visible = false
        back.hides++
      },
      onClick: (handler) => {
        back.handler = handler
      },
      offClick: () => {
        back.handler = null
      },
    },
  }
  return { webApp, calls, back }
}

const GLOBAL_KEYS = [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'Element',
  'Node',
  'SVGElement',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'InputEvent',
  'Event',
  'EventTarget',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MessageChannel',
  'localStorage',
  'sessionStorage',
  'Blob',
  'File',
  'FileReader',
  'FormData',
  'Headers',
  'AbortController',
  'ResizeObserver',
  'IntersectionObserver',
  'DOMParser',
  'MutationObserver',
]

/** Fresh jsdom + Telegram stub + mocked API, then mount the real app. */
const mountApp = async ({ bundle, url, routes, sessionKeys }) => {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (err) =>
    console.log('[jsdomError]', err.message.split('\n')[0]),
  )
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url, pretendToBeVisual: true, virtualConsole },
  )
  const { window } = dom
  for (const [key, value] of Object.entries(sessionKeys)) {
    window.sessionStorage.setItem(key, value)
  }
  for (const key of GLOBAL_KEYS) {
    if (window[key] !== undefined) {
      try {
        globalThis[key] = window[key]
      } catch {}
    }
  }
  globalThis.window = window
  window.scrollTo = () => {}
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  const telegram = telegramStub()
  window.Telegram = { WebApp: telegram.webApp }

  globalThis.fetch = async (input) => {
    const path = new URL(String(input), 'http://api.cake.test').pathname
    const handler = routes[path]
    return {
      ok: Boolean(handler),
      status: handler ? 200 : 404,
      headers: { get: () => 'application/json' },
      json: async () => (handler ? handler() : { message: 'not mocked' }),
      text: async () => JSON.stringify(handler ? handler() : {}),
    }
  }
  window.fetch = globalThis.fetch

  createRequire(import.meta.url)(bundle)
  await sleep(700)
  return { dom, window, telegram, $: (s) => window.document.querySelector(s) }
}

const click = (window, el) =>
  el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

// =====================================================================
// 1. Sale terminal
// =====================================================================
console.log('\n########## sale terminal in a fullscreen Mini App ##########')
{
  const bundle = await bundleEntry('telegram-sale-entry')
  const products = [
    {
      id: 1,
      name: 'Matcha Cake',
      category: 'Whole cakes',
      price: 12,
      stock: 6,
      sold: 0,
      revenue: 0,
      status: 'Fresh',
      madeAt: '2026-09-01',
      bestBefore: '2026-09-04',
      imagePosition: 'center',
      active: true,
    },
  ]
  const { window, telegram, $ } = await mountApp({
    bundle,
    url: 'http://localhost:4174/',
    sessionKeys: {
      'atelier.authToken': 'audit-token',
      'atelier.language': 'en',
    },
    routes: {
      '/api/products': () => products,
      '/api/categories': () => [{ id: 1, name: 'Whole cakes' }],
      '/api/orders': () => [],
      '/api/orders/held': () => [],
      '/api/orders/pending': () => [],
      '/api/shifts/current': () => ({
        id: 1,
        status: 'Open',
        openingCash: 100,
        startedAt: '2026-09-01T08:00:00Z',
      }),
      '/api/settings/pos-rules': () => ({
        defaultShelfLifeDays: 3,
        exchangeRateKhrPerUsd: 4100,
      }),
    },
  })
  const inset = (name) =>
    window.document.documentElement.style.getPropertyValue(name)

  check(
    'the terminal announces itself and asks for true fullscreen',
    telegram.calls.ready >= 1 &&
      telegram.calls.expand >= 1 &&
      telegram.calls.fullscreen >= 1,
    JSON.stringify(telegram.calls),
  )
  check(
    'scrolling the product grid can no longer minimise the app',
    telegram.calls.swipesDisabled >= 1,
  )
  // THE fix: 59px notch + 46px of Telegram chrome = 105px reserved. The
  // old max() reserved 59px and left the header under the back button.
  check(
    'the top inset reserves the notch AND Telegram\u2019s own controls',
    inset('--tg-inset-top') === '105px',
    inset('--tg-inset-top'),
  )
  check(
    'both halves stay inspectable (device 59 + chrome 46)',
    inset('--tg-safe-top') === '59px' &&
      inset('--tg-content-safe-top') === '46px',
    `${inset('--tg-safe-top')} + ${inset('--tg-content-safe-top')}`,
  )
  check(
    'the bottom inset clears the home indicator',
    inset('--tg-inset-bottom') === '34px',
    inset('--tg-inset-bottom'),
  )
  check(
    'the root carries .telegram-app so those padding rules apply at all',
    $('.telegram-app') !== null,
  )
  check(
    'the header is inside that Telegram-padded root',
    $('.telegram-app .terminal-header') !== null,
  )

  // ------------------------------------------- the NATIVE back button
  check(
    'nothing is layered over the terminal: no back button offered',
    telegram.back.visible === false,
  )
  // The sale history is a real layer over the terminal — open it the way a
  // cashier does, from the toolbar.
  click(window, $('.terminal-history-button'))
  await sleep(200)
  check(
    'opening the history layer shows Telegram\u2019s own back button',
    $('.modal-card') !== null && telegram.back.visible === true,
    `modal=${$('.modal-card') !== null} back=${telegram.back.visible}`,
  )
  telegram.back.handler?.()
  await sleep(200)
  check(
    'tapping it closes that layer instead of leaving the Mini App',
    $('.modal-card') === null,
  )
  check(
    'and the button is handed back to Telegram once nothing is layered',
    telegram.back.visible === false,
  )

  // ------------------------------------ a cart in progress is protected
  check(
    'an empty cart does not nag on close',
    telegram.calls.confirmOn === 0,
    String(telegram.calls.confirmOn),
  )
  click(window, $('.product-card'))
  await sleep(200)
  check(
    'a cart with items asks Telegram to confirm before closing',
    telegram.calls.confirmOn >= 1,
    JSON.stringify({
      cartRows: window.document.querySelectorAll('.cart-line, .cart-row').length,
      confirmOn: telegram.calls.confirmOn,
    }),
  )
  window.close()
}

// =====================================================================
// 2. Admin console — same bot, same treatment
// =====================================================================
console.log('\n########## admin console in a fullscreen Mini App ##########')
{
  const bundle = await bundleEntry('entry')
  const { window, telegram, $ } = await mountApp({
    bundle,
    url: 'http://localhost:4173/',
    sessionKeys: {
      'atelier.authToken': 'audit-token',
      'atelier.language': 'en',
    },
    routes: {
      '/api/products': () => fx.products,
      '/api/categories': () => fx.categories,
      '/api/orders': () => fx.orders,
      '/api/employees': () => fx.employees,
      '/api/customers': () => fx.customers,
      '/api/shifts': () => fx.shifts,
      '/api/shifts/current': () => fx.currentShift,
      '/api/reports/summary': () => fx.summary,
      '/api/freshness': () => fx.freshness,
      '/api/media': () => fx.media,
      '/api/settings/pos-rules': () => fx.posRules,
      '/api/settings/business-profile': () => fx.businessProfile,
      '/api/settings/receipt-template': () => fx.receiptTemplate,
    },
  })
  const inset = (name) =>
    window.document.documentElement.style.getPropertyValue(name)

  check(
    'the console asks for the same fullscreen chrome as the terminal',
    telegram.calls.ready >= 1 &&
      telegram.calls.expand >= 1 &&
      telegram.calls.fullscreen >= 1,
    JSON.stringify(telegram.calls),
  )
  check(
    'the console reserves the notch AND Telegram\u2019s controls',
    inset('--tg-inset-top') === '105px',
    inset('--tg-inset-top'),
  )
  check(
    'the shell carries .telegram-app so the top bar is pushed below them',
    $('.app-shell.telegram-app') !== null,
    $('.app-shell')?.className,
  )
  check(
    'the top bar lives inside that padded shell',
    $('.telegram-app .topbar') !== null,
  )
  check(
    'the dashboard is home: no back button until there is somewhere to go',
    telegram.back.visible === false,
  )

  const heading = () => $('.page-heading')?.textContent || ''
  const ordersLink = [
    ...window.document.querySelectorAll('.nav-item, .side-link, button'),
  ].find((el) => /orders/i.test(el.textContent || ''))
  click(window, ordersLink)
  await sleep(300)
  check(
    'navigating to another page works',
    /orders/i.test(heading()),
    heading().slice(0, 40),
  )
  check(
    'leaving the dashboard offers Telegram\u2019s back button',
    telegram.back.visible === true,
  )
  telegram.back.handler?.()
  await sleep(300)
  check(
    'tapping it returns to the dashboard instead of closing the console',
    !/orders/i.test(heading()) && telegram.back.visible === false,
    heading().slice(0, 40),
  )
  window.close()
}

console.log(
  failures === 0
    ? '\nALL TELEGRAM CHROME CHECKS PASSED'
    : `\n${failures} TELEGRAM CHROME CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
