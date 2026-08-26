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
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};
