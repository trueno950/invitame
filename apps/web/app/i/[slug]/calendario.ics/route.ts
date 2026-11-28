import { cookies } from "next/headers";
import { connection } from "next/server";

import {
  LANGUAGE_COOKIE,
  languageChoiceParameters,
  requestedLocale,
  resolveGuestLocale,
} from "../../../../lib/i18n/guest-locale.ts";
import {
  invitationCalendarFile,
  invitationCalendarPath,
} from "../../../../lib/public/invitation-features.ts";
import { lockedRedirectSlug } from "../../../../lib/public/invitation-lock.ts";
import { loadPublicInvitation } from "../_lib/load.ts";

/**
 * `GET /i/[slug]/calendario.ics` (F3; S4): the calendar download of a published invitation, next to its page.
 * It reads the same public projection the page reads, through the same cookie-free client and the same
 * per-request cache, and builds the file from the invitation's own facts and stored zone. A slug that is not
 * public, a snapshot whose facts cannot be read, and a zone this runtime cannot format all answer the same
 * plain 404, so the download never confirms anything the page would not show. An invitation that stores an
 * access code answers its locked state, and the file is only served to a device that unlocked it (F13; L18.2).
 *
 * Nothing is logged here: the request carries no session, and the invitation's content is personal data. The
 * response is never stored, because the owner may change the date or the place at any time (A6).
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  await connection();
  const [{ slug }, cookieJar] = await Promise.all([params, cookies()]);
  const loaded = await loadPublicInvitation(slug);

  // An invitation that stores an access code answers the locked state before the file is built (F13; L18.2), and a locked
  // guest who followed a previous address downloads nothing here: the route answers the file of the current address with a
  // permanent redirect, exactly as the unlocked alias redirect does.
  if (loaded.status === "locked") {
    const current = lockedRedirectSlug(slug, loaded.redirectTo);

    return current === undefined
      ? new Response(null, { status: 404 })
      : new Response(null, {
          status: 308,
          headers: {
            location: invitationCalendarPath(current),
            "cache-control": "no-store",
          },
        });
  }

  if (loaded.status !== "ok") {
    return new Response(null, { status: 404 });
  }

  // A previous address downloads nothing of its own: it answers a permanent redirect to the file of the current
  // address, so an already shared calendar link keeps working (F11; S2.11, L15.3).
  if (loaded.invitation.redirectTo !== null) {
    return new Response(null, {
      status: 308,
      headers: {
        location: invitationCalendarPath(loaded.invitation.redirectTo),
        "cache-control": "no-store",
      },
    });
  }

  // The file's fixed parts follow the locale the page renders (F14; L19.2), resolved with exactly the page's own rules:
  // the owner's setting first, then this request's `?idioma=`, then the cookie this device remembered.
  const locale = resolveGuestLocale({
    language: loaded.invitation.features.language,
    requested: requestedLocale(languageChoiceParameters(new URL(request.url).searchParams)),
    remembered: cookieJar.get(LANGUAGE_COOKIE)?.value,
  });
  const file = invitationCalendarFile(loaded.invitation, new Date(), locale);

  if (file === undefined) {
    return new Response(null, { status: 404 });
  }

  return new Response(file.body, { status: 200, headers: file.headers });
}
