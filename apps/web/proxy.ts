import { type NextRequest, NextResponse } from "next/server";

import { proxyAuthRequest } from "./lib/server/auth-proxy.ts";
import { getWebServerConfig } from "./lib/server/config.ts";
import {
  appendSetCookies,
  refreshSessionCookies,
  SESSION_REFRESH_TIMEOUT_MS,
  shouldRefreshSession,
} from "./lib/server/session-refresh.ts";

/**
 * Next.js proxy (formerly middleware), run before the pages that read the session render (M2 T8c; L34). It
 * refreshes the session through the web's own `/api/auth` proxy first, so the browser receives the
 * extended cookie before the render's `GET /me` refreshes the stored session without one. See
 * `lib/server/session-refresh.ts`. A failed refresh never blocks the page.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next();

  if (shouldRefreshSession(request)) {
    const cookies = await refreshSessionCookies(request, (refresh) =>
      proxyAuthRequest(refresh, {
        config: getWebServerConfig(),
        timeoutMs: SESSION_REFRESH_TIMEOUT_MS,
      }),
    );
    appendSetCookies(response.headers, cookies);
  }

  return response;
}

// Must be a literal (Next.js reads it at build time); keep it equal to `isSessionPagePath`.
export const config = {
  matcher: ["/ingresar", "/cuenta", "/cuenta/:path*"],
};
