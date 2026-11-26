/**
 * The gift registry of a guest invitation (F2; S2.2, L4.1, L4.3, L4.5). The owner keeps the stores, the transfer data,
 * the envelopes line, and one note as feature data of one invitation, and every layout draws the same card from it.
 * The API validates the payload and answers `features.giftRegistry` as the stores, the transfer, the envelopes flag,
 * and the note only while the pinned package grants `GIFT_REGISTRY` and the registry shows something, so this module is
 * the web's strict reader of that answer, the copy of the card, and the group of a CLABE for reading.
 *
 * Nothing here knows a package, a template, or a provider: a store is a name, an optional reference, and a link, and
 * the block draws them in the order the owner stored.
 */

/** The only payload version this deployment reads and writes; a later shape needs its own reader (L4.1). */
export const GIFT_REGISTRY_VERSION = 1;

/** The most stores one registry holds, mirroring the API's bound and the editor's own list (L4.1). */
export const GIFT_REGISTRY_MAX_STORES = 8;

/** The longest name of one store, mirroring the API's rule (L4.1). */
export const GIFT_REGISTRY_STORE_NAME_MAX_LENGTH = 40;

/** The longest reference of one store, mirroring the API's rule (L4.1). */
export const GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH = 60;

/** The longest link of one store, mirroring the API's rule (L4.1). */
export const GIFT_REGISTRY_STORE_URL_MAX_LENGTH = 500;

/** The longest bank name and holder of the transfer, mirroring the API's rule (L4.1). */
export const GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH = 60;

/** The width of a CLABE: eighteen digits, the last one its control digit (L4.1). */
export const GIFT_REGISTRY_CLABE_DIGITS = 18;

/** The longest note of a registry, mirroring the API's rule (L4.1). */
export const GIFT_REGISTRY_NOTE_MAX_LENGTH = 200;

/** The section's title, which the artboard draws as the card's heading (L4.5). */
export const GIFT_REGISTRY_SECTION_TITLE = "Mesa de regalos";

/** The one sentence under the heading: the artboard's own note, in the page's voice (L4.5). */
export const GIFT_REGISTRY_SECTION_HINT =
  "Tu presencia es nuestro mejor regalo; si quieres consentirnos, aquí te dejamos opciones.";

/** The heading of the transfer block inside the card (L4.5). */
export const GIFT_REGISTRY_TRANSFER_TITLE = "Transferencia";

/** The label of the copy button, and the confirmation it shows once the CLABE is on the clipboard (L4.5). */
export const GIFT_REGISTRY_COPY_CLABE = "Copiar CLABE";
export const GIFT_REGISTRY_COPIED = "¡Copiada!";

/** The action of one store's row, drawn as «Ver mesa →» with an arrow that is not the only cue (L4.5). */
export const GIFT_REGISTRY_VIEW_STORE = "Ver mesa";
export const GIFT_REGISTRY_VIEW_STORE_ARROW = "→";

/** The envelope line a guest who prefers a gift in cash reads (L4.5). */
export const GIFT_REGISTRY_ENVELOPES_LINE =
  "También puedes darnos tu regalo en un sobre el día del evento.";

/** One store a guest may buy from, as the card draws it. */
export interface GiftRegistryStore {
  readonly name: string;
  readonly reference?: string;
  readonly url: string;
}

/** The bank transfer data of a gift. */
export interface GiftRegistryTransfer {
  readonly bank: string;
  readonly holder: string;
  readonly clabe: string;
}

/** The registry a guest page draws: no version, and a null transfer and note when the owner stored none. */
export interface GiftRegistry {
  readonly stores: readonly GiftRegistryStore[];
  readonly transfer: GiftRegistryTransfer | null;
  readonly envelopes: boolean;
  readonly note: string | null;
}

/** The payload one invitation stores, as the owner read and the write carry it (F2; L4.1). */
export interface GiftRegistryPayload {
  readonly version: typeof GIFT_REGISTRY_VERSION;
  readonly stores: readonly GiftRegistryStore[];
  readonly transfer?: GiftRegistryTransfer;
  readonly envelopes: boolean;
  readonly note?: string;
}

/** The content field the layouts read an older invitation's gift registry text from (F2; L4.3). */
export const LEGACY_GIFT_REGISTRY_FIELD = "giftRegistry";

/** The only keys one store carries; the card reads nothing else, so a body with another key is refused. */
const STORE_KEYS: ReadonlySet<string> = new Set(["name", "reference", "url"]);

/** The only keys the guest's registry carries. */
const REGISTRY_KEYS: ReadonlySet<string> = new Set(["stores", "transfer", "envelopes", "note"]);

/** The only keys the owner's payload carries. */
const PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "version",
  "stores",
  "transfer",
  "envelopes",
  "note",
]);

/** The separators people paste inside a CLABE: spaces (including no-break ones) and dashes. */
const CLABE_SEPARATORS = /[\s-]/gu;

/** Eighteen digits and nothing else, once the separators are gone. */
const CLABE_DIGITS = /^[0-9]{18}$/;

/** The weights of the CLABE control digit, repeating over the first seventeen digits (Banxico's rule). */
const CLABE_WEIGHTS = [3, 7, 1] as const;

/** A whitespace or control character in a store link: no URL the API stores carries one. */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/** A JSON object as a response answers it; arrays, null, and primitives are not objects. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether a record carries a key outside the shape this contract documents. */
function hasOtherKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

/** One optional text, trimmed, or undefined when it says nothing; null when it is no bounded text at all. */
function optionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();

  if (text === "") {
    return undefined;
  }
  return [...text].length <= maxLength ? text : null;
}

/** One required bounded text, trimmed, or undefined when the value is not one this contract could have written. */
function requiredText(value: unknown, maxLength: number): string | undefined {
  const text = optionalText(value, maxLength);

  return text === undefined || text === null ? undefined : text;
}

/**
 * The compact digits of a CLABE, or null when the value is not eighteen digits behind its separators. A text with
 * anything else — a letter, a different width — is no CLABE at all.
 */
export function clabeDigits(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replaceAll(CLABE_SEPARATORS, "");

  return CLABE_DIGITS.test(digits) ? digits : null;
}

/**
 * Whether a value is an eighteen-digit CLABE whose last digit is its control digit (F2; L4.1). The separator spaces
 * and dashes people paste are dropped first; the weights 3, 7, 1 repeat over the first seventeen digits, and the
 * control digit completes the sum to the next multiple of ten. This is the API's own rule, repeated here because a
 * guest page and an editor never import API code, and a value the rule refuses is not one the API stored.
 */
export function isClabe(value: unknown): boolean {
  const digits = clabeDigits(value);

  if (digits === null) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < GIFT_REGISTRY_CLABE_DIGITS - 1; index += 1) {
    sum += Number(digits[index]) * (CLABE_WEIGHTS[index % CLABE_WEIGHTS.length] as number);
  }

  return (10 - (sum % 10)) % 10 === Number(digits[GIFT_REGISTRY_CLABE_DIGITS - 1]);
}

/**
 * A CLABE grouped for reading, without changing its digits: groups of four and the last two, as the artboard draws
 * `0121 8000 0123 4567 82` (L4.5). A value no CLABE has is answered as it came, so the card never hides what the API
 * stored.
 */
export function clabeGroups(clabe: string): string {
  const digits = clabeDigits(clabe);

  if (digits === null) {
    return clabe;
  }
  return (digits.match(/.{1,4}/g) ?? []).join(" ");
}

/**
 * Whether an `https` link this deployment renders for a store (L4.1): at most 500 characters, no whitespace or control
 * character, and a URL the parser reads whose scheme is `https`. Any host is allowed, because the owner's store is not
 * a host allow-list this web owns.
 */
export function isGiftRegistryStoreUrl(value: string): boolean {
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

/** One store read from a response, or undefined when it is not a shape the API stores. */
function parseStore(value: unknown): GiftRegistryStore | undefined {
  const store = record(value);

  if (store === undefined || hasOtherKeys(store, STORE_KEYS)) {
    return undefined;
  }

  const name = requiredText(store.name, GIFT_REGISTRY_STORE_NAME_MAX_LENGTH);
  const reference = optionalText(store.reference, GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH);
  const url = typeof store.url === "string" ? store.url.trim() : "";

  if (name === undefined || reference === null || !isGiftRegistryStoreUrl(url)) {
    return undefined;
  }
  return { name, ...(reference === undefined ? {} : { reference }), url };
}

/** The transfer read from a response, or `null`/undefined when it is none/a shape the API does not store. */
function parseTransfer(value: unknown): GiftRegistryTransfer | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const transfer = record(value);

  if (
    transfer === undefined ||
    Object.keys(transfer).some((key) => !["bank", "holder", "clabe"].includes(key))
  ) {
    return undefined;
  }

  const bank = requiredText(transfer.bank, GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH);
  const holder = requiredText(transfer.holder, GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH);
  const digits = clabeDigits(transfer.clabe);

  if (bank === undefined || holder === undefined || digits === null || !isClabe(digits)) {
    return undefined;
  }
  return { bank, holder, clabe: digits };
}

/** The stores of one answer, or undefined when the list or any store is not one this contract carries. */
function parseStores(value: unknown): GiftRegistryStore[] | undefined {
  if (!Array.isArray(value) || value.length > GIFT_REGISTRY_MAX_STORES) {
    return undefined;
  }

  const stores: GiftRegistryStore[] = [];
  for (const item of value) {
    const store = parseStore(item);

    if (store === undefined) {
      return undefined;
    }
    stores.push(store);
  }
  return stores;
}

/**
 * The gift registry of one invitation as a guest page reads it (F2; L4.3): the stores in the API's order, the transfer
 * or null, the envelopes flag, and the note or null; `null` when the read answered no registry (or an older API did
 * not answer the field at all); or `undefined` when the body is not this contract — the payload's version, another key,
 * a store without a link, a CLABE the control digit refuses, or a note outside its bound. A value written around the
 * API never reaches a guest.
 */
export function parseGiftRegistry(value: unknown): GiftRegistry | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const registry = record(value);

  if (registry === undefined || hasOtherKeys(registry, REGISTRY_KEYS)) {
    return undefined;
  }
  // The guaranteed keys are the whole shape: the API answers a transfer and a note as null when there is none, so a
  // body without either is not this contract.
  if (
    typeof registry.envelopes !== "boolean" ||
    !Object.hasOwn(registry, "transfer") ||
    !Object.hasOwn(registry, "note")
  ) {
    return undefined;
  }

  const stores = parseStores(registry.stores);
  const transfer = parseTransfer(registry.transfer);
  const note = optionalText(registry.note, GIFT_REGISTRY_NOTE_MAX_LENGTH);

  if (stores === undefined || transfer === undefined || note === null) {
    return undefined;
  }
  return { stores, transfer, envelopes: registry.envelopes, note: note ?? null };
}

/**
 * The gift registry payload of the owner's read (F2; L4.1): `{ version: 1, stores, transfer?, envelopes, note? }` in the
 * owner's order, `null` when the invitation stores none (or a body written before the field existed), or `undefined`
 * when the body is not the payload this deployment writes. The version is part of the owner's shape because the editor
 * sends the same payload back; the guest read answers the stores and the rest only.
 */
export function parseGiftRegistryPayload(value: unknown): GiftRegistryPayload | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const payload = record(value);

  if (
    payload === undefined ||
    payload.version !== GIFT_REGISTRY_VERSION ||
    hasOtherKeys(payload, PAYLOAD_KEYS)
  ) {
    return undefined;
  }
  if (typeof payload.envelopes !== "boolean") {
    return undefined;
  }

  const stores = parseStores(payload.stores);
  const transfer = parseTransfer(payload.transfer);
  const note = optionalText(payload.note, GIFT_REGISTRY_NOTE_MAX_LENGTH);

  if (stores === undefined || transfer === undefined || note === null) {
    return undefined;
  }

  return {
    version: GIFT_REGISTRY_VERSION,
    stores,
    ...(transfer === null ? {} : { transfer }),
    envelopes: payload.envelopes,
    ...(note === undefined ? {} : { note }),
  };
}

/**
 * Whether a registry has something a guest would see (F2; L4.3): at least one store, a transfer, or the envelopes line.
 * That is the same rule the API uses to answer `null`, so the guest read, the card, and the legacy field withheld behind
 * it all read one definition of an empty registry.
 */
export function giftRegistryHasContent(
  registry: GiftRegistry | GiftRegistryPayload | null | undefined,
): boolean {
  return (
    registry !== null &&
    registry !== undefined &&
    (registry.stores.length > 0 ||
      (registry.transfer !== undefined && registry.transfer !== null) ||
      registry.envelopes)
  );
}

/**
 * The hidden fields of a page, with the legacy gift registry text withheld while the structured registry shows (F2;
 * L4.3). A guest — and the owner's preview, which shows exactly what the guest would see — never sees both: the value is
 * dropped from the parsed content and the layout draws no block for it. An empty registry changes nothing, and the list
 * keeps its order and never names a field twice.
 */
export function hideLegacyGiftRegistry(
  hiddenFields: readonly string[],
  registry: GiftRegistry | GiftRegistryPayload | null | undefined,
): string[] {
  if (!giftRegistryHasContent(registry) || hiddenFields.includes(LEGACY_GIFT_REGISTRY_FIELD)) {
    return [...hiddenFields];
  }
  return [...hiddenFields, LEGACY_GIFT_REGISTRY_FIELD];
}

/** The public view of one stored payload (F2; L4.3, L4.5): no version, and null where the owner stored nothing. */
export function giftRegistryOf(payload: GiftRegistryPayload): GiftRegistry {
  return {
    stores: payload.stores.map((store) => ({ ...store })),
    transfer: payload.transfer === undefined ? null : { ...payload.transfer },
    envelopes: payload.envelopes,
    note: payload.note ?? null,
  };
}
