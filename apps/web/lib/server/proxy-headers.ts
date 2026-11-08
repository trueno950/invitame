/**
 * The fixed header that carries the shared web-to-API secret (L36). It must match
 * `AUTH_PROXY_SECRET_HEADER` in `apps/api/src/auth/auth-request-guard.ts`; the API removes it before
 * Better Auth sees the request.
 */
export const AUTH_PROXY_SECRET_HEADER = "x-invitame-proxy-secret";
