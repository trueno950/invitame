import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addGiftRegistryStore,
  canAddGiftRegistryStore,
  EMPTY_GIFT_REGISTRY,
  EMPTY_GIFT_REGISTRY_STORE,
  type GiftRegistryDraft,
  giftRegistryDraftOf,
  giftRegistryNeedsSave,
  giftRegistryPayloadOf,
  isGiftRegistryStoreIncomplete,
  isGiftRegistryTransferIncomplete,
  moveGiftRegistryStore,
  removeGiftRegistryStore,
  setGiftRegistryEnvelopes,
  setGiftRegistryNote,
  setGiftRegistryTransfer,
  updateGiftRegistryStore,
} from "./gift-registry.ts";

// The «Mesa de regalos» block of the editor's «Funciones» tab (F2; L4.4). The owner adds, edits, removes, and reorders
// stores, writes the transfer data, switches the envelopes line, and adds a note; these helpers hold the drafts the
// browser is writing and turn them into the value the feature autosave sends. Everything is pure and immutable, and a
// store that is still being written is never sent: the save waits for it while the stored one keeps its last complete
// version, so a guest never loses what the owner already published.

const STORE = {
  name: "Liverpool",
  reference: "Evento 51234567",
  url: "https://mesaderegalos.liverpool.com.mx/milistaderegalos/51234567",
};

const TRANSFER = { bank: "BBVA", holder: "Ana Martínez", clabe: "012180000123456782" };

function draftsOf(overrides: Partial<GiftRegistryDraft> = {}): GiftRegistryDraft {
  return { ...EMPTY_GIFT_REGISTRY, ...overrides };
}

describe("the editor's registry drafts (F2; L4.4)", () => {
  it("reads a stored payload into the form's texts, and none as an empty form", () => {
    assert.deepEqual(
      giftRegistryDraftOf({
        version: 1,
        stores: [STORE],
        transfer: TRANSFER,
        envelopes: true,
        note: "Con cariño",
      }),
      { stores: [STORE], transfer: TRANSFER, envelopes: true, note: "Con cariño" },
    );
    assert.deepEqual(giftRegistryDraftOf({ version: 1, stores: [], envelopes: false }), {
      stores: [],
      transfer: EMPTY_GIFT_REGISTRY.transfer,
      envelopes: false,
      note: "",
    });
    assert.deepEqual(giftRegistryDraftOf(null), EMPTY_GIFT_REGISTRY);
  });

  it("adds a new empty store, never more than eight, and never a store that does not exist", () => {
    const empty = draftsOf();
    const added = addGiftRegistryStore(empty);

    assert.equal(added.stores.length, 1);
    assert.deepEqual(added.stores[0], EMPTY_GIFT_REGISTRY_STORE);
    assert.equal(canAddGiftRegistryStore(empty), true);

    const full = draftsOf({ stores: Array.from({ length: 8 }, () => ({ ...STORE })) });
    assert.equal(canAddGiftRegistryStore(full), false);
    assert.equal(addGiftRegistryStore(full), full);
  });

  it("updates, removes, and reorders the store the owner points at, and answers the same drafts at a boundary", () => {
    const two = draftsOf({
      stores: [
        { ...STORE },
        { name: "Amazon", reference: "", url: "https://www.amazon.com.mx/wedding/ana-y-luis" },
      ],
    });

    assert.deepEqual(
      updateGiftRegistryStore(two, 0, { name: "Palacio" }).stores[0]?.name,
      "Palacio",
    );
    assert.deepEqual(updateGiftRegistryStore(two, 7, { name: "Nadie" }), two);
    assert.deepEqual(
      removeGiftRegistryStore(two, 1).stores.map((store) => store.name),
      ["Liverpool"],
    );
    assert.deepEqual(removeGiftRegistryStore(two, 9), two);
    assert.deepEqual(
      moveGiftRegistryStore(two, 1, "up").stores.map((store) => store.name),
      ["Amazon", "Liverpool"],
    );
    assert.deepEqual(moveGiftRegistryStore(two, 0, "up"), two);
    assert.deepEqual(moveGiftRegistryStore(two, 1, "down"), two);
    // Every helper answers new objects, so a caller's state is never rewritten under it.
    assert.notEqual(addGiftRegistryStore(two), two);
    assert.equal(two.stores.length, 2);
  });

  it("changes the transfer, the envelopes switch, and the note without touching the rest", () => {
    const empty = draftsOf();

    assert.deepEqual(setGiftRegistryTransfer(empty, { bank: "BBVA" }).transfer, {
      bank: "BBVA",
      holder: "",
      clabe: "",
    });
    assert.equal(setGiftRegistryEnvelopes(empty, true).envelopes, true);
    assert.equal(setGiftRegistryNote(empty, "  Con cariño ").note, "  Con cariño ");
    assert.equal(setGiftRegistryEnvelopes(empty, true).note, "");
  });
});

describe("an incomplete store while the owner types (F2; L4.4)", () => {
  it("is a store without a name or without a link, and a transfer with only some of its fields", () => {
    assert.equal(isGiftRegistryStoreIncomplete({ ...STORE }), false);
    assert.equal(isGiftRegistryStoreIncomplete({ ...STORE, name: "  " }), true);
    assert.equal(isGiftRegistryStoreIncomplete({ ...STORE, url: " " }), true);
    assert.equal(isGiftRegistryStoreIncomplete(EMPTY_GIFT_REGISTRY_STORE), true);

    assert.equal(isGiftRegistryTransferIncomplete(EMPTY_GIFT_REGISTRY.transfer), true);
    assert.equal(isGiftRegistryTransferIncomplete({ ...TRANSFER }), false);
    assert.equal(isGiftRegistryTransferIncomplete({ ...TRANSFER, holder: "" }), true);
  });
});

describe("the value one feature save sends (F2; L4.1, L4.4)", () => {
  it("sends the complete stores, trimmed, with a blank reference absent", () => {
    assert.deepEqual(
      giftRegistryPayloadOf(
        draftsOf({
          stores: [{ name: "  Liverpool ", reference: "  ", url: ` ${STORE.url} ` }],
          envelopes: false,
        }),
      ),
      { version: 1, stores: [{ name: "Liverpool", url: STORE.url }], envelopes: false },
    );
  });

  it("never sends an incomplete store, and keeps the stored version of one being retyped", () => {
    const stored = { version: 1 as const, stores: [STORE], envelopes: false };

    // A row with nothing left to say is not a store the owner started: it carries nothing, so removing every text of
    // the only store is how the registry stops showing it.
    assert.equal(
      giftRegistryPayloadOf(draftsOf({ stores: [EMPTY_GIFT_REGISTRY_STORE] }), stored),
      null,
    );

    // Clearing the link while keeping the name is still the stored Liverpool store, so the guest keeps it.
    assert.deepEqual(
      giftRegistryPayloadOf(draftsOf({ stores: [{ ...STORE, url: "" }] }), stored),
      stored,
    );

    // A name typed into a new row that has no link yet adds nothing to the plan.
    assert.deepEqual(
      giftRegistryPayloadOf(
        draftsOf({ stores: [{ ...STORE }, { ...EMPTY_GIFT_REGISTRY_STORE, name: "Amazon" }] }),
        stored,
      ),
      stored,
    );
  });

  it("sends nothing when no store, no transfer, and no envelopes line are written", () => {
    assert.equal(giftRegistryPayloadOf(draftsOf()), null);
    assert.equal(giftRegistryPayloadOf(draftsOf({ note: "Solo una nota" })), null);
    assert.equal(
      giftRegistryPayloadOf(draftsOf({ stores: [EMPTY_GIFT_REGISTRY_STORE] }), null),
      null,
    );
  });

  it("keeps an envelopes-only registry and the note that belongs to it", () => {
    assert.deepEqual(giftRegistryPayloadOf(draftsOf({ envelopes: true, note: "  Con cariño  " })), {
      version: 1,
      stores: [],
      envelopes: true,
      note: "Con cariño",
    });
  });

  it("sends the transfer with its digits compacted, and keeps the stored one while it is retyped", () => {
    const stored = { version: 1 as const, stores: [], transfer: TRANSFER, envelopes: false };

    assert.deepEqual(
      giftRegistryPayloadOf(
        draftsOf({ transfer: { ...TRANSFER, clabe: "0121 8000 0123 4567 82" } }),
        stored,
      ),
      { ...stored, stores: [], transfer: TRANSFER },
    );
    // Only the bank is written: the stored transfer stays, so the guest's copy button never loses its CLABE.
    assert.deepEqual(
      giftRegistryPayloadOf(
        draftsOf({ transfer: { ...TRANSFER, bank: "BBVA Bancomer" }, envelopes: false }),
        stored,
      ),
      { ...stored, transfer: { ...TRANSFER, bank: "BBVA Bancomer" } },
    );
    assert.deepEqual(
      giftRegistryPayloadOf(
        draftsOf({ transfer: { ...EMPTY_GIFT_REGISTRY.transfer, bank: "BBVA" } }),
        stored,
      ),
      { version: 1, stores: [], transfer: TRANSFER, envelopes: false },
    );
    // Everything blank clears the stored transfer, which is how the owner removes it.
    assert.deepEqual(giftRegistryPayloadOf(draftsOf({ stores: [STORE] }), stored), {
      version: 1,
      stores: [STORE],
      envelopes: false,
    });
  });

  it("refuses a complete store or transfer the contract does not allow", () => {
    const payloadOf = (draft: GiftRegistryDraft) => giftRegistryPayloadOf(draft);

    assert.equal(
      payloadOf(
        draftsOf({ stores: [{ ...STORE, url: "http://mesaderegalos.liverpool.com.mx/1" }] }),
      ),
      undefined,
    );
    assert.equal(payloadOf(draftsOf({ stores: [{ ...STORE, name: "a".repeat(41) }] })), undefined);
    assert.equal(
      payloadOf(draftsOf({ stores: [{ ...STORE, reference: "a".repeat(61) }] })),
      undefined,
    );
    assert.equal(
      payloadOf(draftsOf({ stores: Array.from({ length: 9 }, () => ({ ...STORE })) })),
      undefined,
    );
    assert.equal(
      payloadOf(draftsOf({ transfer: { ...TRANSFER, clabe: "012180000123456788" } })),
      undefined,
    );
    assert.equal(
      payloadOf(draftsOf({ transfer: { ...TRANSFER, holder: "a".repeat(61) } })),
      undefined,
    );
    assert.equal(payloadOf(draftsOf({ envelopes: true, note: "a".repeat(201) })), undefined);
  });

  it("keeps the owner's order", () => {
    const payload = giftRegistryPayloadOf(
      draftsOf({
        stores: [
          { ...STORE, name: "Amazon" },
          { ...STORE, name: "Liverpool" },
        ],
      }),
    );

    assert.deepEqual(
      payload?.stores.map((store) => store.name),
      ["Amazon", "Liverpool"],
    );
  });
});

describe("whether the drafts ask for a save (F2; L4.4)", () => {
  it("saves nothing for an untouched form, an added empty store, or a row still being written", () => {
    const stored = { version: 1 as const, stores: [STORE], envelopes: false };
    const current = giftRegistryDraftOf(stored);

    assert.equal(giftRegistryNeedsSave(current, current, stored), false);
    assert.equal(giftRegistryNeedsSave(current, addGiftRegistryStore(current), stored), false);
    assert.equal(
      giftRegistryNeedsSave(current, updateGiftRegistryStore(current, 0, { url: "" }), stored),
      false,
    );
  });

  it("saves a real change: a new complete store, a removed one, the switch, the transfer, and the note", () => {
    const stored = { version: 1 as const, stores: [STORE], envelopes: false };
    const current = giftRegistryDraftOf(stored);
    const amazon = {
      name: "Amazon",
      reference: "",
      url: "https://www.amazon.com.mx/wedding/ana-y-luis",
    };

    assert.equal(
      giftRegistryNeedsSave(
        current,
        updateGiftRegistryStore(addGiftRegistryStore(current), 1, amazon),
        stored,
      ),
      true,
    );
    assert.equal(giftRegistryNeedsSave(current, removeGiftRegistryStore(current, 0), stored), true);
    assert.equal(
      giftRegistryNeedsSave(current, setGiftRegistryEnvelopes(current, true), stored),
      true,
    );
    assert.equal(
      giftRegistryNeedsSave(current, setGiftRegistryNote(current, "Con cariño"), stored),
      true,
    );
    assert.equal(
      giftRegistryNeedsSave(current, setGiftRegistryTransfer(current, TRANSFER), stored),
      true,
    );
  });

  it("asks for a save for a value the contract refuses, so the API's own sentence can reach the status line", () => {
    const stored = { version: 1 as const, stores: [STORE], envelopes: false };
    const current = giftRegistryDraftOf(stored);

    assert.equal(
      giftRegistryNeedsSave(
        current,
        updateGiftRegistryStore(current, 0, { url: "http://mesaderegalos.liverpool.com.mx/1" }),
        stored,
      ),
      true,
    );
  });
});
