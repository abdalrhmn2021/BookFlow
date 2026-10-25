// Where the Express server runs (no /api at the end). Used by next.config.ts (the /api proxy)
// and by lib/serverApi.ts (server-side fetches for page metadata), so both point at the same place.
export const API_ORIGIN = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ??
  "http://localhost:5000"
).replace(/\/$/, "");
