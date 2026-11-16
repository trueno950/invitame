import { GUEST_PAGE_COPY } from "../customer/copy.ts";
import { isGuestToken, isInvitationSlug } from "../server/invitations-api.ts";

/**
 * The addresses of a guest's personal link and of the pass it shows (M6 G4; S1, S4).
 *
 * The API's public read deliberately carries no invitation id (A7), so the pass cannot encode the owner's
 * `/cuenta/invitaciones/<id>/acceso/<token>` address. It encodes `/cuenta/acceso/<slug>/<token>` instead, which names
 * the invitation by the public slug the guest's own URL already shows and the guest by the opaque token the same URL
 * already carries: the QR leaks nothing the guest does not already hold. The owner's page resolves the id from their
 * own invitations list, so no id ever has to travel publicly.
 *
 * Everything here validates whole values and never trims: a slug, a token, or a path that cannot be one names
 * nothing, so it is never put in a URL and never redirected to.
 */

/** Where the owner's check-in page lives: `/cuenta/acceso/<slug>/<token>` (S4). */
export const CHECK_IN_PREFIX = "/cuenta/acceso";

/** The guest's own page: `/i/<slug>/g/<token>`, or undefined when the value could not be one (S4). */
export function personalGuestPath(slug: string, token: string): string | undefined {
  return isInvitationSlug(slug) && isGuestToken(token) ? `/i/${slug}/g/${token}` : undefined;
}

/** The owner's check-in path of one pass, or undefined when the value could not be one (S4). */
export function checkInPath(slug: string, token: string): string | undefined {
  return isInvitationSlug(slug) && isGuestToken(token)
    ? `${CHECK_IN_PREFIX}/${slug}/${token}`
    : undefined;
}

/** A bare http(s) origin, normalized, or undefined: the only origin a pass may be built on. */
function originOf(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return (url.protocol === "http:" || url.protocol === "https:") && url.href === `${url.origin}/`
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The absolute URL the pass encodes: the request's own origin plus the check-in path. The origin comes from the
 * request the page is rendering (`lib/server/request-origin.ts`), so a deployment needs no extra setting.
 */
export function checkInUrl(origin: string, slug: string, token: string): string | undefined {
  const base = originOf(origin);
  const path = checkInPath(slug, token);

  return base === undefined || path === undefined ? undefined : `${base}${path}`;
}

/**
 * The route that remembers where a signed-out owner was going and sends them to sign in (S4). It is a route handler
 * because only a route handler or a server action may set a cookie, and it stores a bare path this module can
 * recognize again — never an absolute URL, so the return can never leave the customer area.
 */
export function afterSignInPath(slug: string, token: string): string | undefined {
  const path = checkInPath(slug, token);

  return path === undefined ? undefined : `${path}/ingresar`;
}

/** Whether the text is exactly one check-in path this deployment builds: no query, no fragment, no trailing slash. */
export function isCheckInPath(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parts = value.split("/");

  return (
    parts.length === 5 &&
    parts[0] === "" &&
    parts[1] === "cuenta" &&
    parts[2] === "acceso" &&
    isInvitationSlug(parts[3]) &&
    isGuestToken(parts[4])
  );
}

/** The first name a greeting and a share message use: the first word of the stored name. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * The «Compartir por WhatsApp» link of one personal link (S4): WhatsApp's own share address with a neutral Spanish
 * message prefilled, naming the guest and carrying the personal link. It opens WhatsApp; it never claims the message
 * was delivered, and this product sends nothing itself.
 */
export function guestShareUrl(guestName: string, personalUrl: string): string | undefined {
  const url = absoluteHttpUrl(personalUrl);
  const name = firstName(guestName);

  if (url === undefined || name === "") {
    return undefined;
  }

  return `https://wa.me/?text=${encodeURIComponent(GUEST_PAGE_COPY.shareMessage(name, url))}`;
}

/** An absolute http(s) URL with a path, or undefined: the only shape a personal link may have. */
function absoluteHttpUrl(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.hash === "" &&
      url.pathname !== "/"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
