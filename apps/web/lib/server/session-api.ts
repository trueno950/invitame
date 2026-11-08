import "server-only";

import { cookies, headers } from "next/headers";

import {
  type ApiClient,
  createApiClient,
  type OwnProfile,
  type OwnProfileUpdate,
  type SessionResult,
} from "./api-client.ts";
import { proxyAuthRequest } from "./auth-proxy.ts";
import { type AuthSessionUser, readAuthSession } from "./auth-session.ts";
import { getWebServerConfig } from "./config.ts";
import { logApiCallFailure, SERVER_LOG_EVENT } from "./server-log.ts";
import { callUnlessApiUnavailable } from "./session-refresh.ts";

/**
 * Session reads and profile updates for server components and server actions (M2 T8b, T8d; L29,
 * L33). The API client is one stateless instance per server process, created on first use; each
 * call reads the current request's cookies or headers and passes them on, keeping nothing between
 * calls. `server-only` makes a client-component import fail the build.
 *
 * Reading the profile here does not extend the browser's session cookie: the API refreshes the
 * stored session but answers this server-to-server call without a `Set-Cookie` the browser could
 * receive. `proxy.ts` runs `GET /api/auth/get-session` through the web's proxy before a signed-in
 * customer page renders, so the refreshed cookie reaches the browser (L34; `session-refresh.ts`).
 * The administrator pages read the session without any refresh (`auth-session.ts`).
 *
 * An unexpected failure of a call is logged once, as its event name, classes, and kind
 * (`server-log.ts`, R4-account-catch-all-unlogged), and rethrown for the page to show its notice.
 * When `proxy.ts` has just found the API failing, the profile calls answer unavailable at once
 * (`session-refresh.ts`, R4-cuenta-outage-latency-serialized).
 */
let client: ApiClient | undefined;

function apiClient(): ApiClient {
  client ??= createApiClient({ config: getWebServerConfig() });
  return client;
}

async function requestCookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

export async function getOwnProfile(): Promise<SessionResult<OwnProfile>> {
  return logApiCallFailure(SERVER_LOG_EVENT.OWN_PROFILE_READ_FAILED, async () =>
    callUnlessApiUnavailable(await headers(), async () =>
      apiClient().getOwnProfile(await requestCookieHeader()),
    ),
  );
}

export async function updateOwnProfile(
  update: OwnProfileUpdate,
): Promise<SessionResult<OwnProfile>> {
  return logApiCallFailure(SERVER_LOG_EVENT.OWN_PROFILE_UPDATE_FAILED, async () =>
    callUnlessApiUnavailable(await headers(), async () =>
      apiClient().updateOwnProfile(await requestCookieHeader(), update),
    ),
  );
}

/**
 * The signed-in user's session as Better Auth's `get-session` returns it, for the administrator pages:
 * a pending administrator cannot read `/me` (ADR 0004 decision 3). The read runs through the web's
 * own `/api/auth` proxy with this request's headers; the proxy's own upstream warning is silenced so a
 * failure is logged once, here.
 */
export async function getAuthSession(): Promise<SessionResult<AuthSessionUser>> {
  return logApiCallFailure(SERVER_LOG_EVENT.AUTH_SESSION_READ_FAILED, async () =>
    readAuthSession(new Headers(await headers()), (request) =>
      proxyAuthRequest(request, { config: getWebServerConfig(), log: () => {} }),
    ),
  );
}
