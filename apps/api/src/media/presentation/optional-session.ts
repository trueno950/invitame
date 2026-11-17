import type { IncomingMessage } from "node:http";
import { Logger } from "@nestjs/common";
import type { AuthService } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";

import {
  type AccountAccess,
  isActive,
  isPendingAdministrator,
  lacksRequiredSecondFactor,
} from "../../auth/account-access";

// The optional session of a media-serving request (M8 S4). `GET /media/:assetId` is `@Public()` because a guest has
// no session and a public image must not depend on the auth store; the owner path needs the session only when the
// invitation is not published, so this read runs only then. The checks mirror `AccessControlGuard` exactly — active
// account, no pending administrator, second factor where required — so an image can never be a weaker path into an
// account than the rest of the API. A failed session read is treated as no session: a broken auth store must not take
// a published image down, and it never grants access.

const logger = new Logger("MediaSession");

/** The user id of the request's session, or null when it has none or it is not authorized. */
export async function optionalSessionUserId(
  auth: AuthService,
  request: IncomingMessage,
): Promise<string | null> {
  if (typeof request.headers.cookie !== "string") {
    return null;
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true },
    });
    const user = session?.user as (AccountAccess & { id?: unknown }) | undefined;

    if (
      !session ||
      !user ||
      typeof user.id !== "string" ||
      user.id === "" ||
      !isActive(user) ||
      isPendingAdministrator(user) ||
      lacksRequiredSecondFactor(user, session.session as { secondFactorVerified?: unknown })
    ) {
      return null;
    }

    return user.id;
  } catch {
    // One structured line without a cookie, a user id, or an error message.
    logger.warn({ event: "media_session_read_failed" });
    return null;
  }
}
