// Same-origin edge proxy, copied from the Field Notes / portfolio pattern.
// The Worker serves the SPA and proxies /api, /sanctum, /up to the VM so the
// browser sees one origin. Sanctum CSRF cookies stay host-only and readable
// via document.cookie — the root cause of the old cross-origin 419s.
//
// Do not set VITE_API_URL. Browser traffic must stay same-origin.

const PROXY_PREFIXES = ['/api', '/sanctum', '/up']

function shouldProxy(pathname) {
  return PROXY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (shouldProxy(url.pathname)) {
      return proxyToBackend(request, url, env)
    }
    return env.ASSETS.fetch(request)
  },
}

async function proxyToBackend(request, url, env) {
  const backendTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:8080'
  const backendUrl = new URL(url.pathname + url.search, backendTarget)

  const forwardHeaders = new Headers(request.headers)
  forwardHeaders.set('Host', backendUrl.host)
  forwardHeaders.set('X-Forwarded-Host', url.host)
  forwardHeaders.set('X-Forwarded-Proto', 'https')
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) {
    forwardHeaders.set('CF-Connecting-IP', clientIp)
    forwardHeaders.set('X-Forwarded-For', clientIp)
  }

  let backendResponse
  try {
    backendResponse = await fetch(backendUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    })
  } catch {
    return new Response(JSON.stringify({ error: 'The API server is unreachable right now.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = new Headers()
  for (const [key, value] of backendResponse.headers) {
    if (key.toLowerCase() !== 'set-cookie') headers.append(key, value)
  }
  // Strip Domain= so cookies become host-only on the frontend origin.
  for (let cookie of backendResponse.headers.getAll('set-cookie')) {
    cookie = cookie.replace(/;\s*domain=[^;]+/i, '')
    headers.append('Set-Cookie', cookie)
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers,
  })
}
