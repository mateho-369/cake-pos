# Lessons carried from the portfolio project

1. `minio-init` `command:` is always a YAML list, never a bare multi-line string.
2. PHP-FPM `clear_env = no` from the first Dockerfile, path verified not guessed.
3. Column nullability and validation nullability must match. Never `NOT NULL default('')` with `nullable` rules.
4. Every browser `fetch()` of a presigned PUT uses `AbortController` + a timeout (45s). Cake photos upload often.
5. Cloudflare Cache Rule bypass for `/api/*`.
6. Compose `${VAR}` reads the **root** `.env`, not `backend/.env`.
7. `imagefttext()` first argument is `$image` (unused until receipt images).
8. VM clone: `git fetch` + `git reset --hard origin/main`. No local commits.
9. Auto-deploy rebuilds the full stack (`up -d --build`), no `--no-deps`.
10. Sale, admin, and API are **three origins**. Auth is Bearer tokens, never cookies / Sanctum SPA sessions. `VITE_API_URL` is required in production. CORS allowlist is the two frontend hosts and must include `Authorization`.
