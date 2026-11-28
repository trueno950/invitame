import { GUESTBOOK_NOTICE_COPY } from "../customer/copy.ts";
import { guestText, type GuestTextKey } from "../i18n/guest-texts.ts";
import type { Locale } from "../i18n/locale.ts";
import type {
  GuestbookBlockView,
  RsvpFormAction,
} from "../invitation-features/invitation-features.ts";
import { isInvitationSlug } from "../server/invitations-api.ts";
import type { PublicInvitationsClient } from "../server/public-invitations-api.ts";

/**
 * The guest's guestbook wall on `/i/[slug]` (F7; S2.7, L10.3, L10.5). The API owns the gate, the validation, the rate
 * limit, the honeypot, and the expiry; this module only decides four things:
 *
 * - whether the page shows the wall at all: only when the API answered `features.guestbook`, which it does only while
 *   the pinned package grants `GUESTBOOK`;
 * - what the submitted form becomes: the guest's name, the message, and the hidden honeypot;
 * - which request the server action sends, with the guest's address read from the incoming request headers;
 * - which query the page reads on the way back.
 *
 * Nothing here logs. A name and a message are what the guest chose to publish, and the only place they travel is the
 * request the API authorizes.
 */

/** The server action a form posts to; the page's action module owns it. */
export type { RsvpFormAction };

/** The one query parameter of the page's notice, and the closed set of codes it may carry. */
export const GUESTBOOK_NOTICE_PARAM = "firma";
export const GUESTBOOK_NOTICE_CODES = [
  "signed",
  "invalid",
  "closed",
  "limited",
  "unavailable",
  // The invitation asked for its password before the signature reached it (F13; L18.2).
  "locked",
] as const;
export type GuestbookNoticeCode = (typeof GUESTBOOK_NOTICE_CODES)[number];

/**
 * The guestbook wall of one guest page, or undefined when this invitation's package does not grant `GUESTBOOK`. The
 * entries arrive newest first and bounded from the API, so this module never sorts or filters them: it hands the wall
 * exactly what a guest may read. An expired invitation keeps the wall and closes the form with a note (S2, L10.5).
 */
export function publicGuestbookBlock(
  entries: GuestbookBlockView["entries"] | null,
  slug: string,
  action: RsvpFormAction | undefined,
  closed = false,
): GuestbookBlockView | undefined {
  if (entries === null || !isInvitationSlug(slug)) {
    return undefined;
  }

  return { slug, entries, closed, ...(action === undefined ? {} : { action }) };
}

/** One submitted form, as the submission the API validates. */
export type GuestbookFormParse =
  | { readonly ok: true; readonly slug: string; readonly value: PublicGuestbookFormValue }
  | { readonly ok: false; readonly slug: string | undefined };

/** The submission the API receives, without the address: that one comes from the request, never the form. */
export interface PublicGuestbookFormValue {
  readonly authorName: string;
  readonly message: string;
  /** The hidden field a bot fills; any value makes the API answer success without storing anything. */
  readonly honeypot: string;
}

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/**
 * One submitted form, as the submission the API validates. The local rules are only the ones a form can get wrong
 * without any judgement — a missing slug, a missing name, and a missing message — so the API stays the authority on the
 * bounds, the gate, the expiry, and the rate limit. A value refused here never becomes a request: the page shows its own
 * error notice instead.
 */
export function parseGuestbookForm(form: FormData): GuestbookFormParse {
  const slug = text(form, "slug");

  if (slug === undefined || !isInvitationSlug(slug)) {
    return { ok: false, slug: undefined };
  }

  const authorName = text(form, "authorName")?.trim() ?? "";
  const message = text(form, "message")?.trim() ?? "";

  if (authorName === "" || message === "") {
    return { ok: false, slug };
  }

  return {
    ok: true,
    slug,
    value: { authorName, message, honeypot: text(form, "honeypot") ?? "" },
  };
}

/** The page's own path for one invitation, where the notice of a signature comes back. */
export function guestbookPagePath(slug: string): string {
  return `/i/${slug}`;
}

/** The page's path with one notice code, which the page renders as a Spanish sentence (L10.3). */
export function guestbookResultTarget(slug: string, code: GuestbookNoticeCode): string {
  return `${guestbookPagePath(slug)}?${GUESTBOOK_NOTICE_PARAM}=${code}`;
}

/** The notice the page renders, with the code it came from so a success and a failure read differently. */
export interface GuestbookNotice {
  readonly code: GuestbookNoticeCode;
  readonly message: string;
}

/**
 * The sentence of each code (F14; L19.2): the code travels unchanged and only the sentence the page draws follows the
 * locale it renders.
 */
const NOTICE_KEYS: Readonly<Record<GuestbookNoticeCode, GuestTextKey>> = {
  signed: "notice.guestbook.signed",
  invalid: "notice.guestbook.invalid",
  closed: "notice.guestbook.closed",
  limited: "notice.guestbook.limited",
  unavailable: "notice.guestbook.unavailable",
  locked: "lock.writeRefused",
};

/** The notice the page's query carries, in the locale it renders, or undefined for anything it does not know. */
export function guestbookNotice(
  parameters: Record<string, string | string[] | undefined> = {},
  locale: Locale = "es",
): GuestbookNotice | undefined {
  const code = parameters[GUESTBOOK_NOTICE_PARAM];

  if (typeof code !== "string" || !Object.hasOwn(GUESTBOOK_NOTICE_COPY, code)) {
    return undefined;
  }

  const known = code as GuestbookNoticeCode;

  return { code: known, message: guestText(locale, NOTICE_KEYS[known]) };
}

/** The sentence of the notice the page's query carries, or undefined for anything else. */
export function guestbookNoticeMessage(
  parameters: Record<string, string | string[] | undefined> = {},
  locale: Locale = "es",
): string | undefined {
  return guestbookNotice(parameters, locale)?.message;
}

/** The client call this module needs, so a test can hand it a fake and see exactly what it sent. */
export type PublicGuestbookClient = Pick<PublicInvitationsClient, "submitGuestbook">;

/** Each refusal of the API, as the notice the guest page shows (L10.3). */
const RESULT_CODES: Readonly<
  Record<"invalid" | "closed" | "rate-limited" | "not-found" | "locked", GuestbookNoticeCode>
> = {
  invalid: "invalid",
  closed: "closed",
  "rate-limited": "limited",
  // The invitation stores an access code this device has not unlocked: the page draws its lock screen and says so
  // (F13; L18.2).
  locked: "locked",
  // The page itself answers 404 for a slug that no longer resolves, so the notice says nothing new.
  "not-found": "unavailable",
};

/**
 * Sends one signature and answers the path the action redirects to (L10.3). The guest's address is the one the caller
 * read from the incoming request's headers: it is never part of the form, and it is what the API's rate limit counts
 * against. Every failure becomes one of the page's own notices, so a refused signature never shows an API body and an
 * outage never breaks the invitation.
 */
export async function submitPublicGuestbookForm(
  client: PublicGuestbookClient,
  form: FormData,
  request: { clientAddress: string | undefined },
): Promise<string> {
  const parsed = parseGuestbookForm(form);

  if (!parsed.ok) {
    return parsed.slug === undefined
      ? // Nothing in the form names an invitation: there is no page to come back to but the home page.
        "/"
      : guestbookResultTarget(parsed.slug, "invalid");
  }

  let code: GuestbookNoticeCode;

  try {
    const result = await client.submitGuestbook(
      parsed.slug,
      parsed.value,
      request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress },
    );

    code = result.ok ? "signed" : RESULT_CODES[result.failure];
  } catch {
    // Already logged by the server wrapper; the guest reads one sentence instead of an error page.
    code = "unavailable";
  }

  return guestbookResultTarget(parsed.slug, code);
}
