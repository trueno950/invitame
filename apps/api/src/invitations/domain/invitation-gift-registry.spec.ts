import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GIFT_REGISTRY_CLABE_DIGITS,
  GIFT_REGISTRY_MAX_STORES,
  GIFT_REGISTRY_NOTE_MAX_LENGTH,
  GIFT_REGISTRY_STORE_NAME_MAX_LENGTH,
  GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH,
  GIFT_REGISTRY_STORE_URL_MAX_LENGTH,
  GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH,
  isClabe,
  storedGiftRegistry,
  validateGiftRegistry,
} from "./invitation-gift-registry";

// The gift registry payload of one invitation (F2; S2.2, L4.1). It is pure data: a versioned set of 0 to 8 stores,
// an optional bank transfer with an 18-digit CLABE, the envelopes flag, and one optional note. The validator is the
// only authority on the shape; the column stores the JSONB as it comes and a read the domain refuses shows no
// registry at all.

const STORE = {
  name: "Liverpool",
  reference: "Evento 51234567",
  url: "https://mesaderegalos.liverpool.com.mx/milistaderegalos/51234567",
};

const TRANSFER = {
  bank: "BBVA",
  holder: "Ana Martínez",
  clabe: "012180000123456782",
};

/** A payload with `count` stores, the first one the documented shape. */
function payloadOf(count: number): { version: 1; stores: unknown[]; envelopes: boolean } {
  return {
    version: 1,
    stores: Array.from({ length: count }, (_, index) => ({
      ...STORE,
      name: `Tienda ${index + 1}`,
    })),
    envelopes: false,
  };
}

/** The issues of a payload, or the value the domain assigned it. */
function issuesOf(payload: unknown): unknown {
  const validated = validateGiftRegistry(payload);

  return validated.ok ? validated.value : validated.issues;
}

describe("the gift registry payload (F2; S2.2, L4.1)", () => {
  it("accepts the documented payload and keeps the owner's order", () => {
    assert.deepEqual(
      validateGiftRegistry({
        version: 1,
        stores: [STORE, { name: "Amazon", url: "https://www.amazon.com.mx/wedding/ana-y-luis" }],
        transfer: TRANSFER,
        envelopes: true,
        note: "Si prefieres, también puedes llevarlo el día del evento.",
      }),
      {
        ok: true,
        value: {
          version: 1,
          stores: [STORE, { name: "Amazon", url: "https://www.amazon.com.mx/wedding/ana-y-luis" }],
          transfer: TRANSFER,
          envelopes: true,
          note: "Si prefieres, también puedes llevarlo el día del evento.",
        },
      },
    );
  });

  it("trims every text and reads a blank optional value as absent", () => {
    assert.deepEqual(
      issuesOf({
        version: 1,
        stores: [
          { name: "  Liverpool ", reference: "  Evento 51234567  ", url: " https://x.mx/1 " },
        ],
        transfer: { bank: " BBVA ", holder: " Ana Martínez ", clabe: "012180000123456782" },
        envelopes: false,
        note: "   ",
      }),
      {
        version: 1,
        stores: [{ name: "Liverpool", reference: "Evento 51234567", url: "https://x.mx/1" }],
        transfer: { bank: "BBVA", holder: "Ana Martínez", clabe: "012180000123456782" },
        envelopes: false,
      },
    );
  });

  it("accepts an empty registry, eight stores, and no transfer at all", () => {
    for (const value of [null, undefined, { version: 1, stores: [], envelopes: false }]) {
      assert.deepEqual(validateGiftRegistry(value), { ok: true, value: null }, String(value));
    }
    assert.equal(validateGiftRegistry(payloadOf(GIFT_REGISTRY_MAX_STORES)).ok, true);
    assert.equal(GIFT_REGISTRY_MAX_STORES, 8);
  });

  it("refuses a ninth store with one deterministic issue", () => {
    assert.deepEqual(validateGiftRegistry(payloadOf(GIFT_REGISTRY_MAX_STORES + 1)), {
      ok: false,
      issues: ["giftRegistry.stores must have at most 8 stores"],
    });
  });

  it("accepts every https link and refuses another scheme, a non-URL, and one wider than 500", () => {
    const storeOf = (url: unknown) =>
      issuesOf({ version: 1, stores: [{ name: "Liverpool", url }], envelopes: false });

    for (const url of ["https://x.mx", "https://mesaderegalos.liverpool.com.mx/a?b=c#d"]) {
      assert.equal(typeof storeOf(url), "object", String(url));
    }
    for (const url of [
      "http://x.mx",
      "//x.mx",
      "javascript:alert(1)",
      "x.mx",
      `https://x.mx/${"a".repeat(GIFT_REGISTRY_STORE_URL_MAX_LENGTH)}`,
      42,
    ]) {
      assert.deepEqual(
        storeOf(url),
        ["giftRegistry.stores[0].url must be an https link of at most 500 characters"],
        String(url),
      );
    }
  });

  it("bounds the store name and reference", () => {
    const storeOf = (store: unknown) => issuesOf({ version: 1, stores: [store], envelopes: false });

    assert.equal(
      typeof storeOf({
        name: "a".repeat(GIFT_REGISTRY_STORE_NAME_MAX_LENGTH),
        reference: "a".repeat(GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH),
        url: "https://x.mx",
      }),
      "object",
    );
    assert.equal(GIFT_REGISTRY_STORE_NAME_MAX_LENGTH, 40);
    assert.equal(GIFT_REGISTRY_STORE_REFERENCE_MAX_LENGTH, 60);

    for (const name of ["", "   ", "a".repeat(41), 7]) {
      assert.deepEqual(storeOf({ name, url: "https://x.mx" }), [
        "giftRegistry.stores[0].name must be between 1 and 40 characters",
      ]);
    }
    for (const reference of ["a".repeat(61), 7]) {
      assert.deepEqual(storeOf({ name: "Liverpool", reference, url: "https://x.mx" }), [
        "giftRegistry.stores[0].reference must be a string of at most 60 characters",
      ]);
    }
  });

  it("refuses a transfer without a bank, a holder, or a valid CLABE", () => {
    const transferOf = (transfer: unknown) =>
      issuesOf({ version: 1, stores: [], envelopes: false, transfer });

    for (const transfer of ["BBVA", 7, []]) {
      assert.deepEqual(transferOf(transfer), ["giftRegistry.transfer must be an object or null"]);
    }
    assert.equal(transferOf(null), null);
    assert.equal(GIFT_REGISTRY_TRANSFER_TEXT_MAX_LENGTH, 60);

    assert.deepEqual(transferOf({ bank: "  ", holder: "Ana", clabe: TRANSFER.clabe }), [
      "giftRegistry.transfer.bank must be between 1 and 60 characters",
    ]);
    assert.deepEqual(transferOf({ bank: "BBVA", holder: "", clabe: TRANSFER.clabe }), [
      "giftRegistry.transfer.holder must be between 1 and 60 characters",
    ]);
    assert.deepEqual(transferOf({ bank: "BBVA", holder: "a".repeat(61), clabe: TRANSFER.clabe }), [
      "giftRegistry.transfer.holder must be between 1 and 60 characters",
    ]);

    // A transfer alone is a registry: the bank, the holder, and the CLABE are the whole block.
    assert.deepEqual(transferOf({ ...TRANSFER, bank: "  BBVA ", holder: " Ana " }), {
      version: 1,
      stores: [],
      transfer: { ...TRANSFER, holder: "Ana" },
      envelopes: false,
    });
  });

  it("accepts an 18-digit CLABE with a valid control digit and refuses every other one", () => {
    assert.equal(GIFT_REGISTRY_CLABE_DIGITS, 18);
    // Real-world shaped examples: BBVA (032), Banamex (002), and BBVA (012) account numbers.
    for (const clabe of ["032180000118359719", "002180012345678906", "012180000123456782"]) {
      assert.equal(isClabe(clabe), true, clabe);
      assert.equal(
        typeof issuesOf({
          version: 1,
          stores: [],
          envelopes: false,
          transfer: { ...TRANSFER, clabe },
        }),
        "object",
        clabe,
      );
    }
    // The control digit changed, an unsettled one, the wrong width, letters, and a missing value.
    for (const clabe of [
      "032180000118359718",
      "012180000123456788",
      "01218000012345678",
      "0121800001234567829",
      "01218000012345678a",
      "",
      12345,
    ]) {
      assert.equal(isClabe(clabe), false, String(clabe));
      assert.deepEqual(
        issuesOf({ version: 1, stores: [], envelopes: false, transfer: { ...TRANSFER, clabe } }),
        ["giftRegistry.transfer.clabe must be an 18-digit CLABE with a valid control digit"],
        String(clabe),
      );
    }
  });

  it("groups the separators people paste inside a CLABE and refuses a value that is not a text", () => {
    for (const value of [
      "0121 8000 0123 4567 82",
      "0121-8000-0123-4567-82",
      " 012180000123456782 ",
    ]) {
      assert.deepEqual(
        issuesOf({
          version: 1,
          stores: [],
          envelopes: false,
          transfer: { ...TRANSFER, clabe: value },
        }),
        {
          version: 1,
          stores: [],
          transfer: TRANSFER,
          envelopes: false,
        },
        value,
      );
    }
  });

  it("requires the envelopes flag and bounds the note at 200 characters", () => {
    assert.equal(GIFT_REGISTRY_NOTE_MAX_LENGTH, 200);

    for (const envelopes of [undefined, null, "true", 1]) {
      assert.deepEqual(
        issuesOf({ version: 1, stores: [STORE], envelopes }),
        ["giftRegistry.envelopes must be true or false"],
        String(envelopes),
      );
    }
    assert.equal(
      typeof issuesOf({
        version: 1,
        stores: [STORE],
        envelopes: true,
        note: "a".repeat(GIFT_REGISTRY_NOTE_MAX_LENGTH),
      }),
      "object",
    );
    assert.deepEqual(
      issuesOf({
        version: 1,
        stores: [STORE],
        envelopes: false,
        note: "a".repeat(GIFT_REGISTRY_NOTE_MAX_LENGTH + 1),
      }),
      ["giftRegistry.note must be a string of at most 200 characters"],
    );
  });

  it("stores no registry when nothing would be shown, and keeps the note with an envelopes registry", () => {
    for (const value of [
      { version: 1, stores: [], envelopes: false },
      { version: 1, stores: [], envelopes: false, note: "Solo una nota" },
    ]) {
      assert.equal(issuesOf(value), null, JSON.stringify(value));
    }
    assert.deepEqual(issuesOf({ version: 1, stores: [], envelopes: true, note: "¡Sobres!" }), {
      version: 1,
      stores: [],
      envelopes: true,
      note: "¡Sobres!",
    });
  });

  it("refuses a payload that is not an object, another version, and stores that are not a list", () => {
    for (const value of ["mesa", 1, [], true]) {
      assert.deepEqual(issuesOf(value), ["giftRegistry must be an object or null"]);
    }
    for (const version of [0, 2, "1", null]) {
      assert.deepEqual(issuesOf({ version, stores: [STORE], envelopes: false }), [
        "giftRegistry.version must be 1",
      ]);
    }
    for (const stores of ["Liverpool", 1, {}, null]) {
      assert.deepEqual(issuesOf({ version: 1, stores, envelopes: false }), [
        "giftRegistry.stores must be a list",
      ]);
    }
  });

  it("refuses a store that is not an object, naming its index", () => {
    assert.deepEqual(issuesOf({ version: 1, stores: [STORE, "Amazon"], envelopes: false }), [
      "giftRegistry.stores[1] must be an object",
    ]);
  });

  it("reports every issue, the payload, then each store in the owner's order", () => {
    assert.deepEqual(
      issuesOf({
        version: 3,
        stores: [{ name: "", reference: "a".repeat(61), url: "http://x.mx" }, "Amazon"],
        transfer: { bank: "", holder: "", clabe: "123" },
        envelopes: "sí",
        note: "a".repeat(201),
      }),
      [
        "giftRegistry.version must be 1",
        "giftRegistry.stores[0].name must be between 1 and 40 characters",
        "giftRegistry.stores[0].reference must be a string of at most 60 characters",
        "giftRegistry.stores[0].url must be an https link of at most 500 characters",
        "giftRegistry.stores[1] must be an object",
        "giftRegistry.transfer.bank must be between 1 and 60 characters",
        "giftRegistry.transfer.holder must be between 1 and 60 characters",
        "giftRegistry.transfer.clabe must be an 18-digit CLABE with a valid control digit",
        "giftRegistry.envelopes must be true or false",
        "giftRegistry.note must be a string of at most 200 characters",
      ],
    );
  });
});

describe("a stored gift registry (F2; L4.1)", () => {
  it("answers the stored payload while the domain accepts it", () => {
    const stored = { version: 1, stores: [STORE], transfer: TRANSFER, envelopes: true };

    assert.deepEqual(storedGiftRegistry(stored), stored);
  });

  it("shows no registry for NULL and for a row written around the API", () => {
    for (const value of [
      null,
      undefined,
      { version: 7, stores: [STORE], envelopes: false },
      { version: 1, stores: [{ name: "Liverpool" }], envelopes: false },
      { version: 1, stores: [], envelopes: false },
      "mesa",
    ]) {
      assert.equal(storedGiftRegistry(value), null, JSON.stringify(value));
    }
  });
});
