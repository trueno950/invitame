import { GUEST_PAGE_COPY } from "../customer/copy.ts";
import type {
  GuestPassBlockView,
  GuestRsvpBlockView,
  RsvpFormAction,
} from "../invitation-features/invitation-features.ts";
import {
  GUEST_SEATS_MAX,
  GUEST_SEATS_MIN,
  isGuestToken,
  isInvitationSlug,
} from "../server/invitations-api.ts";
import type {
  PublicGuestResponse,
  PublicGuestRsvpSubmission,
  PublicGuestRsvpSubmitResult,
  PublicInvitationsClient,
  PublicRsvpFeature,
} from "../server/public-invitations-api.ts";
import { personalGuestPath } from "./guest-pass.ts";
import { isRsvpClosed } from "./invitation-rsvp.ts";

/**
 * The personal page of one guest (M6 G4; S1, S4): the greeting, the seats they were given, and their own attendance
 * card. The API owns the guest, the deadline, the rate limit, and every bound; this module decides what the page
 * shows and which request one submitted form becomes.
 *
 * Two rules shape the card: it never asks for a name or a phone (the guest record already holds them, and the API
 * ignores them in the body — S4), and the party it offers stops at the guest's own seats, so a guest cannot confirm
 * more people than the creator reserved. A decline names no party at all. Nothing here logs: a message is personal
 * data, and the only place it travels is the request the API authorizes.
 */

/** The visible greeting: «Hola, Ana», from the first word of the stored name. */
export function guestGreeting(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";

  return GUEST_PAGE_COPY.greeting(first);
}

/** The seats the guest holds, as one sentence, with the singular when it is one. */
export function guestSeatsSentence(seats: number): string {
  return seats === 1 ? GUEST_PAGE_COPY.seatsOne : GUEST_PAGE_COPY.seatsMany(seats);
}

/** The attendance card of a personal page, as the shared features block renders it (S4). */
export type { GuestPassBlockView, GuestRsvpBlockView };

export interface GuestRsvpViewInput {
  readonly slug: string;
  readonly token: string;
  readonly guest: PublicGuestResponse;
  readonly rsvp: PublicRsvpFeature;
  readonly action?: RsvpFormAction;
  readonly now?: Date;
  /**
   * Whether the API flagged the invitation read-only (S2, T5). It closes the card exactly like a passed deadline, and
   * the card then states no deadline: the answers closed because the invitation expired, which the API decided.
   */
  readonly expired?: boolean;
}

/**
 * The card of one personal page, or undefined when this invitation does not take personal answers: the open form and
 * a package with no RSVP have no personal card, and the page shows nothing to answer with.
 */
export function guestRsvpView(input: GuestRsvpViewInput): GuestRsvpBlockView | undefined {
  const { slug, token, guest, rsvp, action, expired = false } = input;

  if (rsvp.mode !== "guest-list" || !isInvitationSlug(slug) || !isGuestToken(token)) {
    return undefined;
  }

  const partySizes = Array.from(
    { length: guest.seats },
    (_unused, index) => GUEST_SEATS_MIN + index,
  );

  return {
    slug,
    token,
    seats: guest.seats,
    partySizes,
    answer:
      guest.response === null
        ? null
        : { attending: guest.response.attending, partySize: guest.response.partySize },
    message: guest.response?.message ?? "",
    deadline: expired ? null : rsvp.deadline,
    closed: isRsvpClosed(rsvp.deadline, input.now ?? new Date(), expired),
    ...(action === undefined ? {} : { action }),
  };
}

/** One submitted answer, as the submission the API validates, or the fields it refused. */
export type GuestRsvpFormParse =
  | {
      readonly ok: true;
      readonly slug: string;
      readonly token: string;
      readonly value: PublicGuestRsvpSubmission;
    }
  | { readonly ok: false; readonly slug: string | undefined; readonly token: string | undefined };

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** A trimmed optional field, or null when the guest left it empty. */
function optional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

/**
 * One submitted answer. The local rules are only the ones a form can get wrong without any judgement — a slug or a
 * token that is missing, a radio that is neither answer, and a party the select cannot produce — so the API stays the
 * authority on the guest's seats, the deadline, and the rate limit. A refused form never becomes a request.
 */
export function parseGuestRsvpForm(form: FormData): GuestRsvpFormParse {
  const slug = text(form, "slug");
  const token = text(form, "token");

  if (
    slug === undefined ||
    token === undefined ||
    !isInvitationSlug(slug) ||
    !isGuestToken(token)
  ) {
    return { ok: false, slug: undefined, token: undefined };
  }

  const attendingValue = text(form, "attending");
  const attending = attendingValue === "si" ? true : attendingValue === "no" ? false : undefined;
  const submittedParty = text(form, "partySize") ?? "";
  const partySize = /^\d{1,2}$/.test(submittedParty) ? Number(submittedParty) : Number.NaN;
  const refused =
    attending === undefined ||
    (attending &&
      (!Number.isInteger(partySize) || partySize < GUEST_SEATS_MIN || partySize > GUEST_SEATS_MAX));

  if (refused || attending === undefined) {
    return { ok: false, slug, token };
  }

  return {
    ok: true,
    slug,
    token,
    value: {
      attending,
      partySize: attending ? partySize : 0,
      message: optional(text(form, "message")),
    },
  };
}

/** The page's path with one notice code, which the page renders as a Spanish sentence (S4). */
export function guestRsvpResultTarget(slug: string, token: string, code: string): string {
  const path = personalGuestPath(slug, token);

  return path === undefined ? "/" : `${path}?rsvp=${code}`;
}

/** The client call this module needs, so a test can hand it a fake and see exactly what it sent. */
export type PublicGuestRsvpClient = Pick<PublicInvitationsClient, "submitGuestRsvp">;

/** Each refusal of the API, as the notice the guest's own page shows (S4). */
const RESULT_CODES: Readonly<
  Record<"invalid" | "not-open" | "rate-limited" | "not-found", string>
> = {
  invalid: "invalid",
  "not-open": "closed",
  "rate-limited": "limited",
  // The page itself answers the friendly 404 for a token that no longer resolves, so the notice says nothing new.
  "not-found": "unavailable",
};

/**
 * Sends one guest's answer and answers the path the action redirects to (S4). The guest's address is the one the
 * caller read from the incoming request's headers: it is never part of the form, and it is what the API's rate limit
 * counts against. Every failure becomes one of the page's own notices, so a refused answer never shows an API body.
 */
export async function submitGuestRsvpForm(
  client: PublicGuestRsvpClient,
  form: FormData,
  request: { clientAddress: string | undefined },
): Promise<string> {
  const parsed = parseGuestRsvpForm(form);

  if (!parsed.ok) {
    return parsed.slug === undefined || parsed.token === undefined
      ? // Nothing in the form names a personal page: there is no page to come back to but the home page.
        "/"
      : guestRsvpResultTarget(parsed.slug, parsed.token, "invalid");
  }

  let code: string;

  try {
    const result: PublicGuestRsvpSubmitResult = await client.submitGuestRsvp(
      parsed.slug,
      parsed.token,
      parsed.value,
      request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress },
    );

    code = result.ok ? "received" : RESULT_CODES[result.failure];
  } catch {
    // Already logged by the server wrapper; the guest reads one sentence instead of an error page.
    code = "unavailable";
  }

  return guestRsvpResultTarget(parsed.slug, parsed.token, code);
}
