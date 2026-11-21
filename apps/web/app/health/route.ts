/**
 * `GET /health` (M10 T3; S1, S5): the web runtime's own liveness probe, and the path
 * `railway.web.json` checks after a deploy. It answers one constant and reads nothing — no session,
 * no cookie, no environment variable, no API call — so it stays 200 while the API or the database is
 * down and it reveals nothing about either. The API's `GET /health` is the database-backed readiness
 * probe (`apps/api/src/health`).
 *
 * `proxy.ts` does not match this path: its matcher lists only the session pages, so no session
 * refresh runs before this route. `apps/web/app/health/route.test.ts` pins both facts.
 */

/** Keeps Next.js from prerendering or caching the answer, so every probe reaches this process. */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
