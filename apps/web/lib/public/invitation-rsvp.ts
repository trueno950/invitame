import { RSVP_NOTICE_COPY } from "../customer/copy.ts";
import type { RsvpBlockView, RsvpFormAction } from "../invitation-features/invitation-features.ts";
import { isInvitationSlug } from "../server/invitations-api.ts";
import type {
  PublicInvitationsClient,
  PublicRsvpFeature,
} from "../server/public-invitations-api.ts";
import { RSVP_PARTY_LIMIT_MAX, RSVP_PARTY_LIMIT_MIN } from "../server/public-invitations-api.ts";

/**
 * The guest's open RSVP form on `/i/[slug]` (M6 G3; S1, S4). The API owns every validation, the rate limit, the
 * honeypot, and the deadline; this module only decides four things:
 *
 * - whether the page shows the block at all: only when the API says the invitation accepts open answers, and the
 *   block itself shows the closing note instead of the form once the deadline passed;
 * - what the submitted form becomes: the guest's name and answer, the party a yes names, the optional phone and
 *   message, and the hidden honeypot;
 * - which request the server action sends, with the guest's address read from the incoming request headers;
 * - which query the page reads on the way back.
 *
 * Nothing here logs. A name, a phone, and a message are personal data, and the only place they travel is the
 * request the API authorizes.
 */

/** The server action a form posts to; the page's action module owns it. */
export type { RsvpFormAction };

/** The one query parameter of the page's notice, and the closed set of codes it may carry. */
export const RSVP_NOTICE_PARAM = "rsvp";
export const RSVP_NOTICE_CODES = [
  "received",
  "invalid",
  "closed",
  "limited",
  "unavailable",
] as const;
export type RsvpNoticeCode = (typeof RSVP_NOTICE_CODES)[number];

/** Where the page shows a closed RSVP: the block's note instead of its form (S4). */
export function isRsvpClosed(deadline: string | null, now: Date): boolean {
  if (deadline === null) {
    return false;
  }
  const at = Date.parse(deadline);

  return Number.isNaN(at) ? false : now.getTime() > at;
}

/**
 * The RSVP block of one guest page, or undefined when this invitation does not accept open answers. A `guest-list`
 * package replaces the open form with personal links (G4; S4), and a package with neither shows nothing here.
 */
export function publicRsvpBlock(
  rsvp: PublicRsvpFeature,
  slug: string,
  action: RsvpFormAction | undefined,
  now: Date = new Date(),
): RsvpBlockView | undefined {
  if (rsvp.mode !== "open" || !isInvitationSlug(slug)) {
    return undefined;
  }

  return {
    slug,
    partyLimit: rsvp.partyLimit,
    deadline: rsvp.deadline,
    closed: isRsvpClosed(rsvp.deadline, now),
    ...(action === undefined ? {} : { action }),
  };
}

/** The answer one submitted form asks to send; every value is what the guest typed or chose. */
export type RsvpFormParse =
  | { readonly ok: true; readonly slug: string; readonly value: PublicRsvpFormValue }
  | { readonly ok: false; readonly slug: string | undefined };

/** The submission the API receives, without the address: that one comes from the request, never the form. */
export interface PublicRsvpFormValue {
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
  readonly phone: string | null;
  readonly message: string | null;
  readonly honeypot: string;
}

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** A trimmed field, or null when the guest left it empty. */
function optional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

/** The party one answer names: the select's own value for a yes, and none at all for a no (S4). */
function partySizeOf(value: string | undefined, attending: boolean): number | undefined {
  if (!attending) {
    return 0;
  }
  if (value === undefined) {
    return undefined;
  }
  const partySize = /^\d{1,2}$/.test(value) ? Number(value) : Number.NaN;

  return Number.isInteger(partySize) &&
    partySize >= RSVP_PARTY_LIMIT_MIN &&
    partySize <= RSVP_PARTY_LIMIT_MAX
    ? partySize
    : undefined;
}

/**
 * One submitted form, as the submission the API validates. The local rules are only the ones a form can get
 * wrong without any judgement — a missing slug, a missing name, a radio that is neither answer, and a party the
 * select cannot produce — so the API stays the authority on every bound, the deadline, and the rate limit. A
 * value refused here never becomes a request: the page shows its own error notice instead.
 */
export function parseRsvpForm(form: FormData): RsvpFormParse {
  const slug = text(form, "slug");

  if (slug === undefined || !isInvitationSlug(slug)) {
    return { ok: false, slug: undefined };
  }

  const attendingValue = text(form, "attending");
  const attending = attendingValue === "si" ? true : attendingValue === "no" ? false : undefined;
  const name = text(form, "name")?.trim() ?? "";
  const partySize = partySizeOf(text(form, "partySize"), attending === true);

  if (attending === undefined || name === "" || partySize === undefined) {
    return { ok: false, slug };
  }

  return {
    ok: true,
    slug,
    value: {
      name,
      attending,
      partySize,
      phone: optional(text(form, "phone")),
      message: optional(text(form, "message")),
      honeypot: text(form, "honeypot") ?? "",
    },
  };
}

/** The page's own path for one invitation, where every notice of an answer comes back. */
export function rsvpPagePath(slug: string): string {
  return `/i/${slug}`;
}

/** The page's path with one notice code, which the page renders as a Spanish sentence (S4). */
export function rsvpResultTarget(slug: string, code: RsvpNoticeCode): string {
  return `${rsvpPagePath(slug)}?${RSVP_NOTICE_PARAM}=${code}`;
}

/** The notice the page renders, with the code it came from so a success and a failure read differently. */
export interface RsvpNotice {
  readonly code: RsvpNoticeCode;
  readonly message: string;
}

/** The Spanish notice the page's query carries, or undefined for anything the page does not know. */
export function rsvpNotice(
  parameters: Record<string, string | string[] | undefined> = {},
): RsvpNotice | undefined {
  const code = parameters[RSVP_NOTICE_PARAM];

  if (typeof code !== "string" || !Object.hasOwn(RSVP_NOTICE_COPY, code)) {
    return undefined;
  }

  return { code: code as RsvpNoticeCode, message: RSVP_NOTICE_COPY[code as RsvpNoticeCode] };
}

/** The Spanish sentence of the notice the page's query carries, or undefined for anything else. */
export function rsvpNoticeMessage(
  parameters: Record<string, string | string[] | undefined> = {},
): string | undefined {
  return rsvpNotice(parameters)?.message;
}

/** The client call this module needs, so a test can hand it a fake and see exactly what it sent. */
export type PublicRsvpClient = Pick<PublicInvitationsClient, "submitRsvp">;

/**
 * Sends one guest's answer and answers the path the action redirects to (S4). The guest's address is the one the
 * caller read from the incoming request's headers: it is never part of the form, and it is what the API's rate
 * limit counts against. Every failure becomes one of the page's own notices, so a refused answer never shows an
 * API body and an outage never breaks the invitation.
 */
export async function submitPublicRsvpForm(
  client: PublicRsvpClient,
  form: FormData,
  request: { clientAddress: string | undefined },
): Promise<string> {
  const parsed = parseRsvpForm(form);

  if (!parsed.ok) {
    return parsed.slug === undefined
      ? // Nothing in the form names an invitation: there is no page to come back to but the home page.
        "/"
      : rsvpResultTarget(parsed.slug, "invalid");
  }

  let code: RsvpNoticeCode;

  try {
    const result = await client.submitRsvp(
      parsed.slug,
      parsed.value,
      request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress },
    );

    code = result.ok ? "received" : RESULT_CODES[result.failure];
  } catch {
    // Already logged by the server wrapper; the guest reads one sentence instead of an error page.
    code = "unavailable";
  }

  return rsvpResultTarget(parsed.slug, code);
}

/** Each refusal of the API, as the notice the guest page shows (S4). */
const RESULT_CODES: Readonly<
  Record<"invalid" | "not-open" | "rate-limited" | "not-found", RsvpNoticeCode>
> = {
  invalid: "invalid",
  "not-open": "closed",
  "rate-limited": "limited",
  // The page itself answers 404 for a slug that no longer resolves, so the notice says nothing new.
  "not-found": "unavailable",
};
