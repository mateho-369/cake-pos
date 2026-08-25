const BACKEND = 'http://cakepos-api.duckdns.org:8080';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const backendUrl = new URL(url.pathname + url.search, BACKEND);
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const response = await fetch(backendUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: hasBody ? request.body : undefined,
      duplex: hasBody ? 'half' : undefined,
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};
