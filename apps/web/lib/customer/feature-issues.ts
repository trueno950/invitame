import { FEATURE_ISSUE_COPY } from "./copy.ts";

/**
 * The reasons the API refuses a feature save, and how they reach the customer in Spanish (F3; S4). The API
 * answers deterministic English issues (`timeZone must be one of the supported time zones`, ...); the save
 * action turns each one into a small code in the page's query, and the page turns the code back into one of
 * these sentences. Raw English never reaches a customer, a repeated issue is named once, and an issue this
 * module does not recognize becomes the generic `other` instead of being guessed at.
 *
 * This module has no imports from the invitation actions, so both the action and the page notices can use it
 * without a cycle.
 */

/** The notice/error code of a refused feature save, shared by the action and the page. */
export const FEATURE_ERROR_CODE = "features-invalid";

/** The small codes one refusal can carry; `other` covers every issue this module does not know. */
export const FEATURE_ISSUE_CODES = [
  "timezone",
  "phone",
  "phone-type",
  "playlist",
  "itinerary",
  "gift-registry",
  "lodging",
  "other",
] as const;
export type FeatureIssueCode = (typeof FEATURE_ISSUE_CODES)[number];

/**
 * The API's own sentences, mirrored by hand: the web never imports API code, so these strings are the
 * contract. `apps/api/src/invitations/domain/invitation-features.ts` writes them, and a change there is a
 * change to this map.
 */
const TIME_ZONE_ISSUE = "timeZone must be one of the supported time zones";
const PHONE_SHAPE_ISSUE =
  "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";
const PHONE_TYPE_ISSUE = "whatsappPhone must be a string or null";
const PLAYLIST_TYPE_ISSUE = "playlistUrl must be a string or null";
const PLAYLIST_SCHEME_ISSUE = "playlistUrl must be an https link";
const PLAYLIST_HOST_ISSUE =
  "playlistUrl must link to Spotify, Apple Music, YouTube, Deezer, or SoundCloud";
const PLAYLIST_LENGTH_ISSUE = "playlistUrl must be at most 500 characters";

const CODE_BY_ISSUE: Readonly<Record<string, FeatureIssueCode>> = {
  [TIME_ZONE_ISSUE]: "timezone",
  [PHONE_SHAPE_ISSUE]: "phone",
  [PHONE_TYPE_ISSUE]: "phone-type",
  // Every refusal of the playlist field is one sentence for the customer: the field, not the reason, is what
  // they have to change (F6; S7).
  [PLAYLIST_TYPE_ISSUE]: "playlist",
  [PLAYLIST_SCHEME_ISSUE]: "playlist",
  [PLAYLIST_HOST_ISSUE]: "playlist",
  [PLAYLIST_LENGTH_ISSUE]: "playlist",
};

/**
 * The issues of the itinerary payload name the moment that refused them (`itinerary.items[2].title ...`), so they
 * are mapped by their prefix instead of by each exact sentence: every one of them is the same field to review.
 */
const ITINERARY_ISSUE_PREFIX = /^itinerary(?:\.|\s|$)/;

/** The gift registry's issues name the store or the transfer field that refused them, so they share one prefix (F2). */
const GIFT_REGISTRY_ISSUE_PREFIX = /^giftRegistry(?:\.|\s|$)/;

/** The lodging's issues name the hotel or the transport field that refused them, so they share one prefix (F4; L7.1). */
const LODGING_ISSUE_PREFIX = /^lodging(?:\.|\s|$)/;

/** One code per distinct issue, and `other` when the refusal named none this module knows. */
export function featureIssueCodes(issues: readonly string[]): FeatureIssueCode[] {
  const codes: FeatureIssueCode[] = [];

  for (const issue of issues) {
    const code = Object.hasOwn(CODE_BY_ISSUE, issue)
      ? (CODE_BY_ISSUE[issue] as FeatureIssueCode)
      : ITINERARY_ISSUE_PREFIX.test(issue)
        ? "itinerary"
        : GIFT_REGISTRY_ISSUE_PREFIX.test(issue)
          ? "gift-registry"
          : LODGING_ISSUE_PREFIX.test(issue)
            ? "lodging"
            : "other";

    if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes.length === 0 ? ["other"] : codes;
}

/** The target a refused feature save comes back to: its error code and the issue codes it named. */
export function featureIssuesTarget(path: string, codes: readonly FeatureIssueCode[]): string {
  return `${path}?error=${FEATURE_ERROR_CODE}&issues=${codes.join(",")}`;
}

const ISSUE_CODE = /^(?:timezone|phone|phone-type|playlist|itinerary|gift-registry|lodging|other)$/;

/** The Spanish sentence of one code; nothing at all for a code this page does not know. */
function issueMessage(code: string): string | undefined {
  return Object.hasOwn(FEATURE_ISSUE_COPY, code)
    ? FEATURE_ISSUE_COPY[code as FeatureIssueCode]
    : undefined;
}

/**
 * The Spanish sentences of an `issues` query value. Only a comma-separated list of known codes is read, so a
 * hand-edited or invented value shows nothing (or one generic sentence) instead of echoing text; a parameter
 * that is not a list of strings is refused whole.
 */
export function featureIssueMessages(value: string | string[] | undefined): string[] {
  const entries = typeof value === "string" ? value.split(",") : value;

  if (!Array.isArray(entries)) {
    return [];
  }

  const messages: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !ISSUE_CODE.test(entry)) {
      continue;
    }
    const message = issueMessage(entry);
    if (message !== undefined && !messages.includes(message)) {
      messages.push(message);
    }
  }
  return messages;
}
