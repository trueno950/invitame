import {
  GIFT_REGISTRY_CLABE_DIGITS,
  GIFT_REGISTRY_MAX_STORES,
  GIFT_REGISTRY_NOTE_MAX_LENGTH,
  GIFT_REGISTRY_STORE_NAME_MAX_LENGTH,
  GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH,
  GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH,
  GIFT_REGISTRY_VERSION,
  type GiftRegistryPayload,
  type GiftRegistryStore,
  type GiftRegistryTransfer,
  clabeDigits,
  isClabe,
  isGiftRegistryStoreUrl,
} from "../invitation-features/gift-registry.ts";

// The «Mesa de regalos» block of the editor's «Funciones» tab (F2; L4.4). The owner adds, edits, removes, and reorders
// the stores, writes the transfer data, switches the envelopes line, and adds a note; these helpers hold the drafts the
// browser is writing and turn them into the value the feature autosave sends. Everything is pure and immutable: a helper
// that changes nothing answers the value it was given, so a boundary (moving the first store up, adding a ninth) never
// looks like a save.
//
// A draft is all texts, because a form control always holds a string. The payload is the strict shape the API stores:
// the texts trimmed, a blank optional one absent, and a store that is still being written never sent — the save waits
// for it while the stored store keeps its last complete version, exactly like the itinerary's own rows (F1; L3.4). An
// entirely blank transfer means the owner removed it; a partially written one keeps what is already stored.

// The editor and the pages that hold its drafts share one payload shape, so a caller imports it from here.
export type { GiftRegistryPayload };

/** One store as the form holds it: three texts, the reference empty when the owner wrote nothing. */
export interface GiftRegistryDraftStore {
  readonly name: string;
  readonly reference: string;
  readonly url: string;
}

/** The transfer as the form holds it: three texts, empty while the owner writes none. */
export interface GiftRegistryDraftTransfer {
  readonly bank: string;
  readonly holder: string;
  readonly clabe: string;
}

/** The whole block as the browser holds it. */
export interface GiftRegistryDraft {
  readonly stores: readonly GiftRegistryDraftStore[];
  readonly transfer: GiftRegistryDraftTransfer;
  readonly envelopes: boolean;
  readonly note: string;
}

/** The message the editor shows while the list is at its bound (L4.1). */
export const GIFT_REGISTRY_DRAFT_LIMIT_MESSAGE = "Puedes agregar hasta 8 tiendas.";

/** The store a new row starts as: everything empty, so the first control is its name. */
export const EMPTY_GIFT_REGISTRY_STORE: GiftRegistryDraftStore = {
  name: "",
  reference: "",
  url: "",
};

/** The transfer a registry without one starts as. */
export const EMPTY_GIFT_REGISTRY_TRANSFER: GiftRegistryDraftTransfer = {
  bank: "",
  holder: "",
  clabe: "",
};

/** The block a registry without one starts as. */
export const EMPTY_GIFT_REGISTRY: GiftRegistryDraft = {
  stores: [],
  transfer: EMPTY_GIFT_REGISTRY_TRANSFER,
  envelopes: false,
  note: "",
};

/** The drafts of one stored payload, or an empty form when the invitation has no registry. */
export function giftRegistryDraftOf(
  payload: GiftRegistryPayload | null | undefined,
): GiftRegistryDraft {
  return {
    stores: (payload?.stores ?? []).map((store) => ({
      name: store.name,
      reference: store.reference ?? "",
      url: store.url,
    })),
    transfer:
      payload?.transfer === undefined ? EMPTY_GIFT_REGISTRY_TRANSFER : { ...payload.transfer },
    envelopes: payload?.envelopes ?? false,
    note: payload?.note ?? "",
  };
}

/** The drafts with one empty store at the end, or the same drafts while the bound is reached (L4.1). */
export function addGiftRegistryStore(drafts: GiftRegistryDraft): GiftRegistryDraft {
  return drafts.stores.length >= GIFT_REGISTRY_MAX_STORES
    ? drafts
    : { ...drafts, stores: [...drafts.stores, EMPTY_GIFT_REGISTRY_STORE] };
}

/** Whether another store may be added. */
export function canAddGiftRegistryStore(drafts: GiftRegistryDraft): boolean {
  return drafts.stores.length < GIFT_REGISTRY_MAX_STORES;
}

/** The drafts with one control of one store changed, or the same drafts when that store does not exist. */
export function updateGiftRegistryStore(
  drafts: GiftRegistryDraft,
  index: number,
  patch: Partial<GiftRegistryDraftStore>,
): GiftRegistryDraft {
  if (!Number.isInteger(index) || index < 0 || drafts.stores[index] === undefined) {
    return drafts;
  }

  return {
    ...drafts,
    stores: drafts.stores.map((store, position) =>
      position === index ? { ...store, ...patch } : store,
    ),
  };
}

/** The drafts without one store, or the same drafts when that store does not exist. */
export function removeGiftRegistryStore(
  drafts: GiftRegistryDraft,
  index: number,
): GiftRegistryDraft {
  if (!Number.isInteger(index) || index < 0 || drafts.stores[index] === undefined) {
    return drafts;
  }

  return { ...drafts, stores: drafts.stores.filter((_store, position) => position !== index) };
}

/** The drafts with one store swapped with its neighbour, or the same drafts at either end of the list. */
export function moveGiftRegistryStore(
  drafts: GiftRegistryDraft,
  index: number,
  direction: "up" | "down",
): GiftRegistryDraft {
  const target = direction === "up" ? index - 1 : index + 1;

  if (!Number.isInteger(index) || drafts.stores[index] === undefined) {
    return drafts;
  }
  if (drafts.stores[target] === undefined) {
    return drafts;
  }

  const stores = [...drafts.stores];
  const moved = stores[index] as GiftRegistryDraftStore;
  stores[index] = stores[target] as GiftRegistryDraftStore;
  stores[target] = moved;
  return { ...drafts, stores };
}

/** The drafts with one control of the transfer changed. */
export function setGiftRegistryTransfer(
  drafts: GiftRegistryDraft,
  patch: Partial<GiftRegistryDraftTransfer>,
): GiftRegistryDraft {
  return { ...drafts, transfer: { ...drafts.transfer, ...patch } };
}

/** The drafts with the envelopes line switched on or off. */
export function setGiftRegistryEnvelopes(
  drafts: GiftRegistryDraft,
  envelopes: boolean,
): GiftRegistryDraft {
  return { ...drafts, envelopes };
}

/** The drafts with the note as the owner typed it; the payload trims it. */
export function setGiftRegistryNote(drafts: GiftRegistryDraft, note: string): GiftRegistryDraft {
  return { ...drafts, note };
}

/** One text trimmed. */
function textOf(value: string): string {
  return value.trim();
}

/**
 * Whether one store row is still being written, because it has no name or no link yet. A row like that is not a store
 * the contract can keep; it stays in the editor with a hint of its own instead of refusing a save the owner did not ask
 * for (L4.4).
 */
export function isGiftRegistryStoreIncomplete(store: GiftRegistryDraftStore): boolean {
  return textOf(store.name) === "" || textOf(store.url) === "";
}

/**
 * Whether the transfer is not completely filled. An entirely empty transfer is not "half written": it is how the owner
 * says the invitation takes no transfer, and `giftRegistryPayloadOf` reads it that way before asking this.
 */
export function isGiftRegistryTransferIncomplete(transfer: GiftRegistryDraftTransfer): boolean {
  return (
    textOf(transfer.bank) === "" || textOf(transfer.holder) === "" || textOf(transfer.clabe) === ""
  );
}

/** Whether two stores carry the same three texts, comparing the optional reference as the empty text. */
function sameStore(left: GiftRegistryStore, right: GiftRegistryStore): boolean {
  return (
    left.name === right.name &&
    (left.reference ?? "") === (right.reference ?? "") &&
    left.url === right.url
  );
}

/** One complete row as a store, trimmed and with a blank reference absent, or nothing while it is being written. */
function shapedStoreOf(store: GiftRegistryDraftStore): GiftRegistryStore | undefined {
  if (isGiftRegistryStoreIncomplete(store)) {
    return undefined;
  }

  const reference = textOf(store.reference);

  return {
    name: textOf(store.name),
    ...(reference === "" ? {} : { reference }),
    url: textOf(store.url),
  };
}

/**
 * The stored store a row being written still stands for: the one whose texts agree with everything the row still says.
 * A row whose link was cleared but whose name is still there is the stored store of that name, and the optional
 * reference narrows the match when it is filled in. A row with nothing left to say matches nothing — it is a row the
 * owner just started — and a stored store this list already kept is never claimed twice.
 */
function storedStoreOf(
  draft: GiftRegistryDraftStore,
  stored: readonly GiftRegistryStore[],
  claimed: ReadonlySet<number>,
): { readonly store: GiftRegistryStore; readonly position: number } | undefined {
  const name = textOf(draft.name);
  const reference = textOf(draft.reference);
  const url = textOf(draft.url);

  if (name === "" && reference === "" && url === "") {
    return undefined;
  }

  for (const [position, store] of stored.entries()) {
    if (claimed.has(position)) {
      continue;
    }
    if (name !== "" && store.name !== name) {
      continue;
    }
    if (reference !== "" && (store.reference ?? "") !== reference) {
      continue;
    }
    if (url !== "" && store.url !== url) {
      continue;
    }
    return { store, position };
  }

  return undefined;
}

/** The transfer one save carries, the reason it is refused, or nothing when the invitation takes none. */
type TransferRead =
  | { readonly kind: "absent" }
  | { readonly kind: "transfer"; readonly transfer: GiftRegistryTransfer }
  | { readonly kind: "refused" };

/**
 * The transfer one save sends (F2; L4.4): nothing when every field is empty (that is how the owner removes it), the
 * stored transfer while it is being retyped, or the complete one the row holds. A complete transfer outside its bounds —
 * a bank or holder of more than 60 characters, a CLABE the control digit refuses — is refused, so the API's own
 * sentence reaches the status line instead of storing half of it.
 */
function transferOf(
  draft: GiftRegistryDraftTransfer,
  stored: GiftRegistryTransfer | undefined,
): TransferRead {
  const bank = textOf(draft.bank);
  const holder = textOf(draft.holder);
  const digits = clabeDigits(draft.clabe);

  if (bank === "" && holder === "" && textOf(draft.clabe) === "") {
    return { kind: "absent" };
  }
  if (isGiftRegistryTransferIncomplete(draft)) {
    return stored === undefined ? { kind: "absent" } : { kind: "transfer", transfer: stored };
  }
  if (
    [...bank].length > GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH ||
    [...holder].length > GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH ||
    digits === null ||
    digits.length !== GIFT_REGISTRY_CLABE_DIGITS ||
    !isClabe(digits)
  ) {
    return { kind: "refused" };
  }

  return { kind: "transfer", transfer: { bank, holder, clabe: digits } };
}

/**
 * The value one feature save sends (F2; L4.1, L4.4): the payload of the complete stores, with every text trimmed and a
 * blank reference absent; `null` when nothing would show (no store, no transfer, and no envelopes line, because a note
 * alone is not a registry); or `undefined` when a complete store, the transfer, or the note is outside its bounds, which
 * is the one case the API refuses and the owner has to fix.
 *
 * A store still being written is never refused: adding an empty row or typing into it must not fail a save. A row the
 * owner is retyping keeps the last complete version the registry already stored (`stored`), so clearing a link does not
 * take the store away from the guests while it is being written; removing the row with «Quitar» is what drops it, and a
 * row that was never complete carries nothing.
 */
export function giftRegistryPayloadOf(
  drafts: GiftRegistryDraft,
  stored: GiftRegistryPayload | null | undefined = null,
): GiftRegistryPayload | null | undefined {
  if (drafts.stores.length > GIFT_REGISTRY_MAX_STORES) {
    return undefined;
  }

  const storedStores = stored?.stores ?? [];
  const shaped = drafts.stores.map(shapedStoreOf);
  // A stored store a complete row already reproduces is not available to a row being written: the payload would carry
  // it twice the moment a new row started with the same name.
  const claimed = new Set<number>();
  for (const store of shaped) {
    if (store === undefined) {
      continue;
    }

    const position = storedStores.findIndex(
      (storedStore, index) => !claimed.has(index) && sameStore(store, storedStore),
    );

    if (position !== -1) {
      claimed.add(position);
    }
  }

  const stores: GiftRegistryStore[] = [];

  for (const [index, draft] of drafts.stores.entries()) {
    const store = shaped[index];

    if (store === undefined) {
      const kept = storedStoreOf(draft, storedStores, claimed);

      if (kept !== undefined) {
        claimed.add(kept.position);
        stores.push(kept.store);
      }
      continue;
    }

    if (
      [...store.name].length > GIFT_REGISTRY_STORE_NAME_MAX_LENGTH ||
      [...(store.reference ?? "")].length > GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH ||
      !isGiftRegistryStoreUrl(store.url)
    ) {
      return undefined;
    }

    stores.push(store);
  }

  const transfer = transferOf(drafts.transfer, stored?.transfer);
  const note = textOf(drafts.note);

  if (transfer.kind === "refused" || [...note].length > GIFT_REGISTRY_NOTE_MAX_LENGTH) {
    return undefined;
  }
  if (stores.length === 0 && transfer.kind === "absent" && !drafts.envelopes) {
    return null;
  }

  return {
    version: GIFT_REGISTRY_VERSION,
    stores,
    ...(transfer.kind === "transfer" ? { transfer: transfer.transfer } : {}),
    envelopes: drafts.envelopes,
    ...(note === "" ? {} : { note }),
  };
}

/** Whether the drafts the editor now holds ask for a save (F2; L4.4): true only when the registry changed. */
export function giftRegistryNeedsSave(
  current: GiftRegistryDraft,
  next: GiftRegistryDraft,
  stored: GiftRegistryPayload | null | undefined = null,
): boolean {
  const before = giftRegistryPayloadOf(current, stored);
  const after = giftRegistryPayloadOf(next, stored);

  if (before === undefined || after === undefined) {
    return true;
  }
  if (before === null || after === null) {
    return before !== after;
  }

  return !(
    before.stores.length === after.stores.length &&
    before.stores.every((store, index) => {
      const other = after.stores[index];

      return other !== undefined && sameStore(store, other);
    }) &&
    before.envelopes === after.envelopes &&
    (before.note ?? "") === (after.note ?? "") &&
    (before.transfer?.bank ?? "") === (after.transfer?.bank ?? "") &&
    (before.transfer?.holder ?? "") === (after.transfer?.holder ?? "") &&
    (before.transfer?.clabe ?? "") === (after.transfer?.clabe ?? "")
  );
}
