/**
 * The gift registry of one invitation (F2; S2.2, L4.1). The owner lists the stores their guests may buy from, the bank
 * transfer data of a gift, the envelopes flag, and an optional note; every layout draws the same card from it, so
 * changing the template never loses it.
 *
 * The stored value is a small, versioned presentation payload and nothing else:
 *
 * ```json
 * {
 *   "version": 1,
 *   "stores": [{ "name": "Liverpool", "reference": "Evento 51234567", "url": "https://…" }],
 *   "transfer": { "bank": "BBVA", "holder": "Ana Martínez", "clabe": "012180000123456782" },
 *   "envelopes": true,
 *   "note": "Si prefieres, también puedes llevarlo el día del evento."
 * }
 * ```
 *
 * The rules are the ones the column cannot state: the version is exactly 1, a payload carries 0 to 8 stores, a store
 * needs a name of 1 to 40 trimmed characters, an optional reference of at most 60, and an `https` URL of at most 500;
 * the optional transfer needs a bank and a holder of 1 to 60 trimmed characters and an 18-digit CLABE whose control
 * digit is right; `envelopes` is required; the note is at most 200 trimmed characters. A blank optional value is
 * absent instead of stored as an empty string. An empty registry — no store, no transfer, and no envelopes — means the
 * invitation has none, and then the whole payload is `null`; a note alone is not a registry, because the card it would
 * describe has nothing to show. Nothing here reads a template, a package, a provider, or a framework: the gate compares
 * catalog keys and this module decides what a store and a transfer are.
 */

/** The only payload version this API stores; a later shape needs a new version and its own reader (L4.1). */
export const GIFT_REGISTRY_VERSION = 1;

/** The most stores one registry holds, and the width the editor's own list offers (L4.1). */
export const GIFT_REGISTRY_MAX_STORES = 8;

/** The longest name of one store, counted in characters after trimming (L4.1). */
export const GIFT_REGISTRY_STORE_NAME_MAX_LENGTH = 40;

/** The longest reference of one store, counted in characters after trimming (L4.1). */
export const GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH = 60;

/** The longest link of one store, counted in characters after trimming (L4.1). */
export const GIFT_REGISTRY_STORE_URL_MAX_LENGTH = 500;

/** The longest bank name and holder of the transfer, counted in characters after trimming (L4.1). */
export const GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH = 60;

/** The width of a CLABE: eighteen digits, the last one its control digit (L4.1). */
export const GIFT_REGISTRY_CLABE_DIGITS = 18;

/** The longest note of a registry, counted in characters after trimming (L4.1). */
export const GIFT_REGISTRY_NOTE_MAX_LENGTH = 200;

/** The separators people paste inside a CLABE: spaces (including no-break ones) and dashes. */
const CLABE_SEPARATORS = /[\s-]/gu;

/** Eighteen digits and nothing else, once the separators are gone. */
const CLABE_DIGITS = /^[0-9]{18}$/;

/** The weights of the CLABE control digit, repeating over the first seventeen digits (Banxico's rule). */
const CLABE_WEIGHTS = [3, 7, 1] as const;

/** A whitespace or control character in a store link: no URL this API stores carries one. */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/** The message a payload that is not an object is refused with. */
export const GIFT_REGISTRY_TYPE_ISSUE = "giftRegistry must be an object or null";

/** The message a payload of another version is refused with. */
export const GIFT_REGISTRY_VERSION_ISSUE = "giftRegistry.version must be 1";

/** The message a payload whose stores are not a list is refused with. */
export const GIFT_REGISTRY_STORES_TYPE_ISSUE = "giftRegistry.stores must be a list";

/** The message a payload with more stores than the bound is refused with. */
export const GIFT_REGISTRY_STORES_LIMIT_ISSUE = "giftRegistry.stores must have at most 8 stores";

/** The message a store that is not an object is refused with, naming its position. */
export function giftRegistryStoreIssue(index: number): string {
  return `giftRegistry.stores[${index}] must be an object`;
}

/** The message a store whose name is outside its bounds is refused with, naming its position. */
export function giftRegistryStoreNameIssue(index: number): string {
  return `giftRegistry.stores[${index}].name must be between 1 and 40 characters`;
}

/** The message a store whose reference is not a bounded text is refused with, naming its position. */
export function giftRegistryStoreReferenceIssue(index: number): string {
  return `giftRegistry.stores[${index}].reference must be a string of at most 60 characters`;
}

/** The message a store whose link is not a bounded `https` URL is refused with, naming its position. */
export function giftRegistryStoreUrlIssue(index: number): string {
  return `giftRegistry.stores[${index}].url must be an https link of at most 500 characters`;
}

/** The message a transfer that is not an object is refused with. */
export const GIFT_REGISTRY_TRANSFER_TYPE_ISSUE = "giftRegistry.transfer must be an object or null";

/** The message a transfer without a bank is refused with. */
export const GIFT_REGISTRY_TRANSFER_BANK_ISSUE =
  "giftRegistry.transfer.bank must be between 1 and 60 characters";

/** The message a transfer without a holder is refused with. */
export const GIFT_REGISTRY_TRANSFER_HOLDER_ISSUE =
  "giftRegistry.transfer.holder must be between 1 and 60 characters";

/** The message a transfer whose CLABE is not an eighteen-digit one with a right control digit is refused with. */
export const GIFT_REGISTRY_CLABE_ISSUE =
  "giftRegistry.transfer.clabe must be an 18-digit CLABE with a valid control digit";

/** The message a payload without the envelopes flag is refused with. */
export const GIFT_REGISTRY_ENVELOPES_ISSUE = "giftRegistry.envelopes must be true or false";

/** The message a note outside its bounds is refused with. */
export const GIFT_REGISTRY_NOTE_ISSUE =
  "giftRegistry.note must be a string of at most 200 characters";

/**
 * One store a guest may buy from, as the card draws it: the name, the optional reference the store gave the owner, and
 * the link to open. Everything is trimmed, and a reference with no visible content is absent instead of empty.
 */
export interface GiftRegistryStore {
  readonly name: string;
  readonly reference?: string;
  readonly url: string;
}

/** The bank transfer data of a gift: the bank, the holder, and the eighteen-digit CLABE. */
export interface GiftRegistryTransfer {
  readonly bank: string;
  readonly holder: string;
  readonly clabe: string;
}

/** A validated registry: the version the reader understands, the stores in the owner's order, and the rest. */
export interface InvitationGiftRegistry {
  readonly version: typeof GIFT_REGISTRY_VERSION;
  readonly stores: readonly GiftRegistryStore[];
  readonly transfer?: GiftRegistryTransfer;
  readonly envelopes: boolean;
  readonly note?: string;
}

/**
 * The registry as a guest page reads it (F2; L4.3): the version stays in the API, and the transfer and the note are
 * answered as `null` when there is none, so a card always reads the same keys. The stores keep the owner's order.
 */
export interface PublicGiftRegistry {
  readonly stores: readonly GiftRegistryStore[];
  readonly transfer: GiftRegistryTransfer | null;
  readonly envelopes: boolean;
  readonly note: string | null;
}

/** A validated payload, or every deterministic English issue that refuses it. */
export type GiftRegistryValidation =
  | { readonly ok: true; readonly value: InvitationGiftRegistry | null }
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
 * One optional text: `null`, `undefined`, and a blank string are absent (a cleared field is not an empty one), a
 * bounded text is trimmed and kept, and every other value — a number, a long text — is refused.
 */
function readOptionalText(value: unknown, maxLength: number): OptionalText {
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
  return [...text].length > maxLength ? { kind: "refused" } : { kind: "text", text };
}

/**
 * Whether a value is an `https` link this API stores for a store (L4.1): at most 500 characters, no whitespace or
 * control character, and a URL the parser reads whose scheme is `https`. Any host is allowed, because the owner's
 * store is not an allow-list this API owns.
 */
function isStoreUrl(value: string): boolean {
  if ([...value].length > GIFT_REGISTRY_STORE_URL_MAX_LENGTH) {
    return false;
  }
  if (URL_UNSTORABLE_CHARACTERS.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === "https:" && parsed.hostname !== "";
  } catch {
    return false;
  }
}

/** The compact digits of a CLABE, or null when the value is not eighteen digits behind its separators. */
function clabeDigitsOf(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replaceAll(CLABE_SEPARATORS, "");

  return CLABE_DIGITS.test(digits) ? digits : null;
}

/**
 * Whether a value is an eighteen-digit CLABE whose last digit is its control digit (L4.1). The separator spaces and
 * dashes people paste are dropped first; the weights 3, 7, 1 repeat over the first seventeen digits, and the control
 * digit completes the sum to the next multiple of ten. Nothing else is accepted, so a value written around the API is
 * no CLABE at all.
 */
export function isClabe(value: unknown): boolean {
  const digits = clabeDigitsOf(value);

  if (digits === null) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < GIFT_REGISTRY_CLABE_DIGITS - 1; index += 1) {
    sum += Number(digits[index]) * (CLABE_WEIGHTS[index % CLABE_WEIGHTS.length] as number);
  }

  return (10 - (sum % 10)) % 10 === Number(digits[GIFT_REGISTRY_CLABE_DIGITS - 1]);
}

/** One store read from an untrusted value: the store, or the issues that refuse it. */
function readStore(value: unknown, index: number): GiftRegistryStore | string[] {
  if (!isJsonObject(value)) {
    return [giftRegistryStoreIssue(index)];
  }

  const issues: string[] = [];
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const reference = readOptionalText(value.reference, GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH);
  const url = typeof value.url === "string" ? value.url.trim() : "";

  if (name === "" || [...name].length > GIFT_REGISTRY_STORE_NAME_MAX_LENGTH) {
    issues.push(giftRegistryStoreNameIssue(index));
  }
  if (reference.kind === "refused") {
    issues.push(giftRegistryStoreReferenceIssue(index));
  }
  if (!isStoreUrl(url)) {
    issues.push(giftRegistryStoreUrlIssue(index));
  }

  if (issues.length > 0) {
    return issues;
  }

  return {
    name,
    ...(reference.kind === "text" ? { reference: reference.text } : {}),
    url,
  };
}

/** The transfer read from an untrusted value: the transfer, its absence, or the issues that refuse it. */
type TransferRead =
  | { readonly kind: "absent" }
  | { readonly kind: "refused"; readonly issues: string[] }
  | { readonly kind: "transfer"; readonly transfer: GiftRegistryTransfer };

/** The transfer read from an untrusted value, or the issues that refuse it. */
function readTransfer(value: unknown): TransferRead {
  if (value === undefined || value === null) {
    return { kind: "absent" };
  }
  if (!isJsonObject(value)) {
    return { kind: "refused", issues: [GIFT_REGISTRY_TRANSFER_TYPE_ISSUE] };
  }

  const issues: string[] = [];
  const bank = typeof value.bank === "string" ? value.bank.trim() : "";
  const holder = typeof value.holder === "string" ? value.holder.trim() : "";
  const digits = clabeDigitsOf(value.clabe);

  if (bank === "" || [...bank].length > GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH) {
    issues.push(GIFT_REGISTRY_TRANSFER_BANK_ISSUE);
  }
  if (holder === "" || [...holder].length > GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH) {
    issues.push(GIFT_REGISTRY_TRANSFER_HOLDER_ISSUE);
  }
  if (digits === null || !isClabe(digits)) {
    issues.push(GIFT_REGISTRY_CLABE_ISSUE);
  }

  if (issues.length > 0) {
    return { kind: "refused", issues };
  }

  return { kind: "transfer", transfer: { bank, holder, clabe: digits as string } };
}

/**
 * Validates the gift registry of one feature-settings request (F2; L4.1). `null`, `undefined`, and a payload that would
 * show nothing — no store, no transfer, and no envelopes — all mean "no registry" and answer `null`, which is how the
 * owner clears it. Every other value must be the versioned payload this API stores; each store is bounded on its own,
 * and every issue is reported in a deterministic order — the payload's, then each store's in the owner's order, then the
 * transfer's, the envelopes flag, and the note — so a client shows them without guessing. The stored value always
 * satisfies the rules above, which is the only shape the column trusts.
 */
export function validateGiftRegistry(value: unknown): GiftRegistryValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!isJsonObject(value)) {
    return { ok: false, issues: [GIFT_REGISTRY_TYPE_ISSUE] };
  }

  const issues: string[] = [];

  if (value.version !== GIFT_REGISTRY_VERSION) {
    issues.push(GIFT_REGISTRY_VERSION_ISSUE);
  }

  const items = value.stores;
  if (!Array.isArray(items)) {
    return { ok: false, issues: [...issues, GIFT_REGISTRY_STORES_TYPE_ISSUE] };
  }
  if (items.length > GIFT_REGISTRY_MAX_STORES) {
    return { ok: false, issues: [...issues, GIFT_REGISTRY_STORES_LIMIT_ISSUE] };
  }

  const stores: GiftRegistryStore[] = [];
  for (const [index, item] of items.entries()) {
    const store = readStore(item, index);

    if (Array.isArray(store)) {
      issues.push(...store);
      continue;
    }
    stores.push(store);
  }

  const transfer = readTransfer(value.transfer);
  if (transfer.kind === "refused") {
    issues.push(...transfer.issues);
  }

  if (typeof value.envelopes !== "boolean") {
    issues.push(GIFT_REGISTRY_ENVELOPES_ISSUE);
  }

  const note = readOptionalText(value.note, GIFT_REGISTRY_NOTE_MAX_LENGTH);
  if (note.kind === "refused") {
    issues.push(GIFT_REGISTRY_NOTE_ISSUE);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (stores.length === 0 && transfer.kind === "absent" && value.envelopes !== true) {
    return { ok: true, value: null };
  }

  return {
    ok: true,
    value: {
      version: GIFT_REGISTRY_VERSION,
      stores,
      ...(transfer.kind === "transfer" ? { transfer: transfer.transfer } : {}),
      envelopes: value.envelopes === true,
      ...(note.kind === "text" ? { note: note.text } : {}),
    },
  };
}

/**
 * Whether a validated registry has something a guest would see (F2; L4.3): at least one store, a transfer, or the
 * envelopes line. That is the same rule the validator uses to answer `null`, so the API's gate, the legacy field it
 * withholds, and the editor's own summary all read one definition of an empty registry.
 */
export function giftRegistryHasContent(
  registry: InvitationGiftRegistry | null | undefined,
): registry is InvitationGiftRegistry {
  return (
    registry !== null &&
    registry !== undefined &&
    (registry.stores.length > 0 || registry.transfer !== undefined || registry.envelopes)
  );
}

/** The public projection of one validated registry, as the guest read answers it (F2; L4.3). */
export function publicGiftRegistry(registry: InvitationGiftRegistry): PublicGiftRegistry {
  return {
    stores: registry.stores.map((store) => ({ ...store })),
    transfer: registry.transfer === undefined ? null : { ...registry.transfer },
    envelopes: registry.envelopes,
    note: registry.note ?? null,
  };
}

/**
 * The registry a stored row carries, or null when the row cannot be one this deployment renders (F2; L4.1). A row
 * written around the API — another version, a store without a link, an invalid CLABE, an empty registry — shows no
 * registry instead of reaching a guest as a value no rule validated.
 */
export function storedGiftRegistry(value: unknown): InvitationGiftRegistry | null {
  if (value === null || value === undefined) {
    return null;
  }

  const validated = validateGiftRegistry(value);

  return validated.ok ? validated.value : null;
}
