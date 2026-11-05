import "server-only";

import { cookies } from "next/headers";

import {
  type ApiClient,
  createApiClient,
  type OwnProfile,
  type OwnProfileUpdate,
  type SessionResult,
} from "./api-client.ts";
import { getWebServerConfig } from "./config.ts";

/**
 * The API client bound to the current request, for server components and server actions (M2 T8b;
 * L29, L33). `server-only` makes a client-component import fail the build.
 *
 * Reading the profile here does not extend the browser's session cookie: the API refreshes the
 * stored session but answers this server-to-server call without a `Set-Cookie` the browser could
 * receive. Pages must also trigger `GET /api/auth/get-session` through the proxy so the refreshed
 * cookie reaches the browser (L34).
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
  return apiClient().getOwnProfile(await requestCookieHeader());
}

export async function updateOwnProfile(
  update: OwnProfileUpdate,
): Promise<SessionResult<OwnProfile>> {
  return apiClient().updateOwnProfile(await requestCookieHeader(), update);
}
