const BACKEND = 'http://cakepos-api.duckdns.org:8080';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const backendUrl = new URL(url.pathname + url.search, BACKEND);
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('content-length');

    const response = await fetch(backendUrl.toString(), {
      method: request.method,
      headers,
      body,
    });
    // Never let a shared cache (Cloudflare edge or anything in front of the
    // Worker) serve a stale API payload. The backend already sends no-store
    // on the shift endpoints; re-asserting it here protects the deployed UI
    // from a rolled-back/older backend that omits it. Without it, the sale
    // terminal can keep showing an old shift badge / stale customer-orders
    // data after a deploy — the classic "deployed stale UI" symptom.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
