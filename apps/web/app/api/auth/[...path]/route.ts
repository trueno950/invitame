import "server-only";

import { proxyAuthRequest } from "../../../../lib/server/auth-proxy.ts";
import { getWebServerConfig } from "../../../../lib/server/config.ts";

/**
 * The browser's only way to Better Auth (M2 T8b; S14, L33): a thin wrapper around the tested proxy.
 * Next.js answers every other method with 405.
 */
function proxy(request: Request): Promise<Response> {
  return proxyAuthRequest(request, { config: getWebServerConfig() });
}

export const GET = proxy;
export const POST = proxy;
