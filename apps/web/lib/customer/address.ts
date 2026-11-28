import { ADDRESS_COPY } from "./copy.ts";

/**
 * The custom invitation address in the editor (F11; S2.11, L15.1, L15.3, L15.4), as the artboard
 * `design/custom-address/01-campo-libre.html` asks for: the configured prefix, the field, a live state, the rule, and the
 * promise that an already shared link still works.
 *
 * The rule itself is the API's. This module owns only what the block needs to draw: the prefix built from configuration,
 * the text the owner's input becomes, and one Spanish sentence per state. It never decides that an address is
 * available — every answer comes from the API's own check — and it keeps no list of reserved words, because a mirror of
 * that list would drift from the server's.
 */

/** The bounds of the rule, from the API's domain (F11; L15.1). */
export const ADDRESS_SLUG_MIN_LENGTH = 3;
export const ADDRESS_SLUG_MAX_LENGTH = 40;

/** How many times one invitation may be renamed (L15.2, approval). */
export const ADDRESS_RENAMES_MAX = 5;

/** What the block may be showing under the field. */
export const ADDRESS_CHECK_STATES = [
  "idle",
  "checking",
  "available",
  "taken",
  "invalid",
  "reserved",
  "rate-limited",
  "unavailable",
] as const;

export type AddressCheckState = (typeof ADDRESS_CHECK_STATES)[number];

/**
 * The address prefix the block shows, built from the deployment's own public origin: `https://invitame.mx` becomes
 * `invitame.mx/i/`, so the owner sees the real address and the product never hard-codes a host (L15.4). An unknown
 * origin falls back to the path alone, which is still the truth of where the invitation lives.
 */
export function addressPrefix(origin: string | undefined): string {
  const value = origin?.trim();

  if (value === undefined || value === "") {
    return "/i/";
  }
  const host = value.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, "").replace(/\/+$/u, "");

  return host === "" ? "/i/" : `${host}/i/`;
}

/** The full address the owner is about to save, as the block previews it. */
export function addressPreview(prefix: string, slug: string): string {
  return `${prefix}${slug}`;
}

/**
 * What the owner's text becomes before it is checked or saved: trimmed, lower-cased, and one line, because the rule is
 * lower-case letters, digits, and hyphens. Everything else the owner types is kept as typed, so the API's own refusal
 * is what says it is not valid.
 */
export function normalizeAddressInput(value: string): string {
  return [...value.trim().toLowerCase()]
    .filter((character) => !"\n\r\t".includes(character))
    .join("");
}

/**
 * The state the API's answer means (F11; L15.3): its four words, the check limit, and an outage. The API answers
 * `available`, `taken`, `invalid`, or `reserved`; a refusal it maps to a failure code becomes the state that explains
 * it. An unknown failure is an outage, never "available".
 */
export function addressCheckState(failure: string): AddressCheckState {
  switch (failure) {
    case "available":
    case "taken":
    case "invalid":
    case "reserved":
    case "rate-limited":
    case "unavailable":
    case "idle":
    case "checking":
      return failure;
    case "slug-rate-limited":
      return "rate-limited";
    case "slug-invalid":
      return "invalid";
    case "slug-reserved":
      return "reserved";
    default:
      return "unavailable";
  }
}

/** The words under the field for each state (F11; L15.4): text, never color alone. */
export function addressStateLabel(state: AddressCheckState): string {
  switch (state) {
    case "available":
      return ADDRESS_COPY.available;
    case "taken":
      return ADDRESS_COPY.taken;
    case "invalid":
      return ADDRESS_COPY.invalid;
    case "reserved":
      return ADDRESS_COPY.reserved;
    case "checking":
      return ADDRESS_COPY.checking;
    case "rate-limited":
      return ADDRESS_COPY.rateLimited;
    case "unavailable":
      return ADDRESS_COPY.unavailable;
    default:
      return "";
  }
}

/**
 * What the block needs to know to draw one answer: what the owner typed, the address the invitation has stored, the
 * state the API last answered and which address that answer belongs to, and how many renames are left (F11; L15.4).
 */
export interface AddressViewInput {
  /** The state the API last answered, as the block stores it. */
  readonly state: AddressCheckState;
  /** The address that answer belongs to, normalized; empty when no answer is stored. */
  readonly checked: string;
  /** How many renames the invitation still has (L15.2). */
  readonly remaining: number;
  /** The address the invitation has stored and is sharing today. */
  readonly savedSlug: string;
  /** What the owner typed. */
  readonly value: string;
}

/** The rule in one line, under the field (L15.4). */
export function addressHint(): string {
  return ADDRESS_COPY.rule;
}

/**
 * The address inside the owner's field right now (L15.4).
 *
 * Nothing typed is an address, and the stored one is; the typed one is only an address once the API answered it is
 * available, so a refused or unchecked value is never shown as if it were where the invitation lives.
 */
function typedAddress(input: AddressViewInput): string {
  return normalizeAddressInput(input.value);
}

/**
 * The state the block renders under the field (F11; L15.4): the answer the API gave for exactly this value, the words
 * for a check still in flight, and nothing at all while the field holds the stored address or is empty. A stale answer
 * never describes a value it was not asked about.
 */
export function addressDisplayState(input: AddressViewInput): AddressCheckState {
  const typed = typedAddress(input);

  if (typed === "" || typed === input.savedSlug) {
    return "idle";
  }
  // A value that was cleared or replaced keeps no answer, so the block asks again instead of reusing an old one.
  if (input.state === "idle" || input.checked !== typed) {
    return "checking";
  }

  return input.state;
}

/**
 * Whether «Guardar dirección» may be used (F11; L15.4): only when the server answered ✓ Disponible for exactly the
 * address in the field, that address is not the stored one, and a rename is left. The server action refuses anything
 * else on its own; this is what keeps the button from offering a save it would have to refuse.
 */
export function canSaveAddress(input: AddressViewInput): boolean {
  return (
    input.remaining > 0 &&
    typedAddress(input) !== input.savedSlug &&
    addressDisplayState(input) === "available"
  );
}

/** The one line under the button that names the address (F11; L15.4). */
export function addressLine(input: AddressViewInput, prefix: string): string {
  if (addressDisplayState(input) === "available") {
    return ADDRESS_COPY.nextAddress(addressPreview(prefix, typedAddress(input)));
  }

  return ADDRESS_COPY.currentAddress(addressPreview(prefix, input.savedSlug));
}

/**
 * Why the save is off, when the answer under the field does not already say it (F11; L15.4). A refused address, an
 * exhausted check limit, and an allowed save need no second sentence; an empty field, the stored address, a check in
 * flight, and a check nobody could answer do.
 */
export function addressSaveHint(input: AddressViewInput): string {
  if (input.remaining <= 0) {
    return "";
  }

  const typed = typedAddress(input);

  if (typed === "") {
    return ADDRESS_COPY.needAddress;
  }
  if (typed === input.savedSlug) {
    return ADDRESS_COPY.alreadyCurrent;
  }

  switch (addressDisplayState(input)) {
    case "checking":
      return ADDRESS_COPY.waitingForCheck;
    case "unavailable":
      return ADDRESS_COPY.saveNeedsCheck;
    default:
      return "";
  }
}

/** How many renames the owner still has, in one sentence (F11; L15.2, L15.4). */
export function renamesRemainingLabel(remaining: number): string {
  if (remaining <= 0) {
    return ADDRESS_COPY.noRenamesLeft;
  }
  if (remaining === 1) {
    return ADDRESS_COPY.oneRenameLeft;
  }

  return ADDRESS_COPY.renamesLeft(remaining);
}
