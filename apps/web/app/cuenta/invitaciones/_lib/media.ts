import "server-only";

import { cookies } from "next/headers";
import { getWebServerConfig } from "../../../../lib/server/config.ts";
import { logInvitationMediaFailure } from "../../../../lib/server/invitation-media-log.ts";
import { createMediaClient, type MediaClient } from "../../../../lib/server/media-api.ts";

/**
 * The invitation media API for the draft page and its server actions (M8 S2, S4). One stateless client per server
 * process, created on first use; each call reads the current request's cookies and keeps nothing, and `server-only`
 * keeps the cookie and the proxy secret out of every browser bundle. The client itself has no marker so `node --test`
 * can prove its mapping, and the actions that need the content path reuse the invitation client of `./api.ts`.
 */
let client: MediaClient | undefined;

function mediaClient(): MediaClient {
  client ??= createMediaClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

async function logged<T>(call: (api: MediaClient) => Promise<T>): Promise<T> {
  try {
    return await call(mediaClient());
  } catch (error) {
    logInvitationMediaFailure(error);
    throw error;
  }
}

/**
 * The media routes the draft page and its actions call. An unexpected failure is logged once by
 * `logInvitationMediaFailure` and rethrown, so the action's own mapping (or the page's unavailable notice) decides what
 * the creator sees; the log line never carries an alt text, a file name, or an id.
 */
export const media = {
  list: (id: string) => logged((api) => api.list(id)),
  limits: (id: string) => logged((api) => api.limits(id)),
  upload: (id: string, upload: Parameters<MediaClient["upload"]>[1]) =>
    logged((api) => api.upload(id, upload)),
  update: (id: string, assetId: string, patch: Parameters<MediaClient["update"]>[2]) =>
    logged((api) => api.update(id, assetId, patch)),
  remove: (id: string, assetId: string) => logged((api) => api.remove(id, assetId)),
};
