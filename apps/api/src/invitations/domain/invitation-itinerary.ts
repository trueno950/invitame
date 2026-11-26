/**
 * The itinerary of one invitation (F1; S2.1, S3-S5, L3.1). The plan of the day is per-invitation feature data, not
 * template content: the owner adds its moments in «Funciones» and every layout draws the same timeline, so changing
 * the template never loses it.
 *
 * The stored value is a small, versioned presentation payload and nothing else:
 *
 * ```json
 * { "version": 1, "items": [{ "time": "17:00", "title": "Misa", "place": "Parroquia", "address": "Av. Juárez 45" }] }
 * ```
 *
 * The rules are the ones the column cannot state: the version is exactly 1, a payload carries 1 to 15 moments, the
 * time is a wall clock from `00:00` to `23:59`, the title is 1 to 60 trimmed characters, the two optional texts are at
 * most 160 trimmed characters each, and a blank optional value is absent instead of stored as an empty string. An
 * absent or empty list means the invitation has no itinerary, which is why `null` is a valid value of the whole
 * payload. Nothing here reads a template, a package, a provider, or a framework: the gate compares catalog keys and
 * this module decides what a moment is.
 */

/** The only payload version this API stores; a later shape needs a new version and its own reader (L3.1). */
export const ITINERARY_VERSION = 1;

/** The most moments one itinerary holds, and the width the editor's own list offers (L3.1). */
export const ITINERARY_MAX_ITEMS = 15;

/** The longest title of one moment, counted in characters after trimming (L3.1). */
export const ITINERARY_TITLE_MAX_LENGTH = 60;

/** The longest place and address of one moment, counted in characters after trimming (L3.1). */
export const ITINERARY_TEXT_MAX_LENGTH = 160;

/** A wall clock as the owner types it: two digits of hour from 00 to 23, and two of minute from 00 to 59. */
const ITINERARY_TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

/** The message a payload that is not an object is refused with. */
export const ITINERARY_TYPE_ISSUE = "itinerary must be an object or null";

/** The message a payload of another version is refused with. */
export const ITINERARY_VERSION_ISSUE = "itinerary.version must be 1";

/** The message a payload whose items are not a list is refused with. */
export const ITINERARY_ITEMS_TYPE_ISSUE = "itinerary.items must be a list";

/** The message a payload with more moments than the bound is refused with. */
export const ITINERARY_ITEMS_LIMIT_ISSUE = "itinerary.items must have at most 15 items";

/** The message a moment that is not an object is refused with, naming its position. */
export function itineraryMomentIssue(index: number): string {
  return `itinerary.items[${index}] must be an object`;
}

/** The message a moment whose time is not a wall clock is refused with, naming its position. */
export function itineraryTimeIssue(index: number): string {
  return `itinerary.items[${index}].time must be a time between 00:00 and 23:59`;
}

/** The message a moment whose title is outside its bounds is refused with, naming its position. */
export function itineraryTitleIssue(index: number): string {
  return `itinerary.items[${index}].title must be between 1 and 60 characters`;
}

/** The message a moment whose place is not a bounded text is refused with, naming its position. */
export function itineraryPlaceIssue(index: number): string {
  return `itinerary.items[${index}].place must be a string of at most 160 characters`;
}

/** The message a moment whose address is not a bounded text is refused with, naming its position. */
export function itineraryAddressIssue(index: number): string {
  return `itinerary.items[${index}].address must be a string of at most 160 characters`;
}

/**
 * One moment of the day, as the guest's timeline draws it: the wall clock the owner typed, the title, and the place
 * and address when they say something. Everything is trimmed, and an optional text with no visible content is absent
 * rather than empty.
 */
export interface ItineraryMoment {
  readonly time: string;
  readonly title: string;
  readonly place?: string;
  readonly address?: string;
}

/** A validated itinerary: the version the reader understands and the moments in the owner's order. */
export interface InvitationItinerary {
  readonly version: typeof ITINERARY_VERSION;
  readonly items: readonly ItineraryMoment[];
}

/** A validated payload, or every deterministic English issue that refuses it. */
export type ItineraryValidation =
  | { readonly ok: true; readonly value: InvitationItinerary | null }
  | { readonly ok: false; readonly issues: readonly string[] };

/** A JSON object as a request or a `Json` column answers it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A text trimmed to its visible content, an absent value, or the reason it is no optional text at all. */
type OptionalText =
  | { readonly kind: "absent" }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "refused" };

/**
 * One optional text of a moment: `null`, `undefined`, and a blank string are absent (a cleared field is not an empty
 * one), a bounded text is trimmed and kept, and every other value — a number, a long text — is refused.
 */
function readOptionalText(value: unknown): OptionalText {
  if (value === undefined || value === null) {
    return { kind: "absent" };
  }
  if (typeof value !== "string") {
    return { kind: "refused" };
  }

  const text = value.trim();

  if (text === "") {
    return { kind: "absent" };
  }
  return [...text].length > ITINERARY_TEXT_MAX_LENGTH
    ? { kind: "refused" }
    : { kind: "text", text };
}

/** One moment read from an untrusted value: the moment, or the issues that refuse it. */
function readMoment(value: unknown, index: number): ItineraryMoment | string[] {
  if (!isJsonObject(value)) {
    return [itineraryMomentIssue(index)];
  }

  const issues: string[] = [];
  const time = typeof value.time === "string" ? value.time.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";

  if (!ITINERARY_TIME.test(time)) {
    issues.push(itineraryTimeIssue(index));
  }
  if (title === "" || [...title].length > ITINERARY_TITLE_MAX_LENGTH) {
    issues.push(itineraryTitleIssue(index));
  }

  const place = readOptionalText(value.place);
  const address = readOptionalText(value.address);

  if (place.kind === "refused") {
    issues.push(itineraryPlaceIssue(index));
  }
  if (address.kind === "refused") {
    issues.push(itineraryAddressIssue(index));
  }

  if (issues.length > 0) {
    return issues;
  }

  return {
    time,
    title,
    ...(place.kind === "text" ? { place: place.text } : {}),
    ...(address.kind === "text" ? { address: address.text } : {}),
  };
}

/**
 * Validates the itinerary of one feature-settings request (F1; L3.1). `null`, `undefined`, and a payload whose list is
 * empty all mean "no itinerary" and answer `null`, which is how the owner clears it. Every other value must be the
 * versioned payload this API stores; each moment is bounded on its own, and every issue is reported in a
 * deterministic order — the payload's, then each moment's in the owner's order — so a client shows them without
 * guessing. The stored value always satisfies the rules above, which is the only shape the column trusts.
 */
export function validateItinerary(value: unknown): ItineraryValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!isJsonObject(value)) {
    return { ok: false, issues: [ITINERARY_TYPE_ISSUE] };
  }

  const issues: string[] = [];

  if (value.version !== ITINERARY_VERSION) {
    issues.push(ITINERARY_VERSION_ISSUE);
  }

  const items = value.items;
  if (!Array.isArray(items)) {
    return { ok: false, issues: [...issues, ITINERARY_ITEMS_TYPE_ISSUE] };
  }

  if (items.length > ITINERARY_MAX_ITEMS) {
    return { ok: false, issues: [...issues, ITINERARY_ITEMS_LIMIT_ISSUE] };
  }

  const moments: ItineraryMoment[] = [];
  for (const [index, item] of items.entries()) {
    const moment = readMoment(item, index);

    if (Array.isArray(moment)) {
      issues.push(...moment);
      continue;
    }
    moments.push(moment);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (moments.length === 0) {
    return { ok: true, value: null };
  }

  return { ok: true, value: { version: ITINERARY_VERSION, items: moments } };
}

/**
 * The itinerary a stored row carries, or null when the row cannot be one this deployment renders (F1; L3.1). A row
 * written around the API — another version, a moment without a title, an empty list — shows no itinerary instead of
 * reaching a guest as a value no rule validated.
 */
export function storedItinerary(value: unknown): InvitationItinerary | null {
  if (value === null || value === undefined) {
    return null;
  }

  const validated = validateItinerary(value);

  return validated.ok ? validated.value : null;
}
