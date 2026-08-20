// Static-assets Worker only. The API lives on api.yourdomain.com (Bearer token,
// CORS). These Workers must NOT proxy /api — that was the old same-origin
// cookie pattern and it is intentionally gone.

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
