import { publicInvitationPath } from "../public/invitation-page.ts";

/**
 * The cookie that carries a guest's access token to one password-protected invitation (F13; S2.13, L18.2).
 *
 * The API's own words: the token travels in the `X-Invitation-Access` header, and the web keeps it out of reach of every
 * script. So the browser stores it in a cookie that no script can read (`HttpOnly`), that never leaves the invitation's
 * own page (`path=/i/<slug>`), that is not sent from another site's page (`SameSite=Lax`), and that is only sent over
 * https in production (`secure`). The lifetime is the token's own: 30 days, after which the API refuses it anyway. A
 * changed or removed code ends the access server-side, so nothing on this side has to expire anything early.
 *
 * The cookie is deliberately not the API's business: the API stores no session, the token is its own proof, and the
 * password version is what revokes it (ADR 0006.3).
 *
 * This module has no `server-only` marker, so `node --test` can prove the rules; the page and the actions that read the
 * cookie live beside the page that owns them.
 */

/** The one cookie name; the token inside is scoped by path, so two invitations never share a value. */
export const INVITATION_ACCESS_COOKIE = "invitame-acceso-invitacion";

/** How long a guest's device remembers the access: the token's own lifetime, 30 days (L18.2). */
export const INVITATION_ACCESS_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The exact shape the API mints: `invaccess1.<version>.<expiry>.<mac>`, with a whole version and expiry and the 43
 * base64url characters of an HMAC-SHA256. A value of another shape is not a token this deployment could have stored, so
 * it is never forwarded and never sent — the gate would only refuse it.
 */
const ACCESS_TOKEN = /^invaccess1\.[0-9]{1,10}\.[0-9]{1,16}\.[A-Za-z0-9_-]{43}$/u;

/** The longest value this module keeps; every minted token is far shorter. */
export const INVITATION_ACCESS_TOKEN_MAX_LENGTH = 84;

/** Whether a value is one access token of the shape the API mints. */
export function isInvitationAccessToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= INVITATION_ACCESS_TOKEN_MAX_LENGTH &&
    ACCESS_TOKEN.test(value)
  );
}

/** The path the cookie is scoped to: the one invitation's public page, `/i/<slug>` (L18.2). */
export function invitationAccessCookiePath(slug: string): string {
  return publicInvitationPath(slug);
}

/**
 * The cookie options Next.js needs for one invitation's access token. A plain object rather than a `cookies().set()`
 * call, so the rules are provable without a request; `secure` follows the scheme the request arrived on, which is how
 * every other cookie of this product is written, and it is always on over https.
 */
export interface InvitationAccessCookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
}

/** The cookie of one invitation's access token, scoped to that invitation's own page (L18.2). */
export function invitationAccessCookie(
  slug: string,
  token: string,
  secure: boolean,
): InvitationAccessCookieOptions {
  return {
    name: INVITATION_ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: invitationAccessCookiePath(slug),
    maxAge: INVITATION_ACCESS_COOKIE_MAX_AGE_SECONDS,
    secure,
  };
}

/**
 * The token a public request presents, from the cookie value the request carried: nothing at all for a value no
 * invitation could have stored, so a hand-edited cookie never becomes a header. The comparison is exact — a value this
 * deployment wrote is exactly one token, and a padded one is not a token it wrote.
 */
export function invitationAccessTokenOf(value: string | undefined): string | undefined {
  return isInvitationAccessToken(value) ? value : undefined;
}
