import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clabeGroups,
  GIFT_REGISTRY_MAX_STORES,
  giftRegistryHasContent,
  giftRegistryOf,
  hideLegacyGiftRegistry,
  isClabe,
  parseGiftRegistry,
  parseGiftRegistryPayload,
} from "./gift-registry.ts";

// The gift registry of a guest invitation (F2; S2.2, L4.1, L4.3, L4.5). The API answers `features.giftRegistry` as the
// stores, the transfer, the envelopes flag, and the note only while the pinned package grants `GIFT_REGISTRY` and the
// registry shows something, so this module is the web's strict reader of that answer, the payload the owner read
// carries, and the group of a CLABE for reading.

const STORE = {
  name: "Liverpool",
  reference: "Evento 51234567",
  url: "https://mesaderegalos.liverpool.com.mx/milistaderegalos/51234567",
};
const TRANSFER = { bank: "BBVA", holder: "Ana Martínez", clabe: "012180000123456782" };
const REGISTRY = { stores: [STORE], transfer: TRANSFER, envelopes: true, note: "Con cariño" };

describe("the guest's gift registry (F2; L4.3)", () => {
  it("reads the documented answer, the owner's order, and a null transfer and note", () => {
    assert.deepEqual(parseGiftRegistry(REGISTRY), REGISTRY);
    assert.deepEqual(
      parseGiftRegistry({ stores: [STORE], transfer: null, envelopes: false, note: null }),
      {
        stores: [STORE],
        transfer: null,
        envelopes: false,
        note: null,
      },
    );
    // An absent answer means no registry, which is what an API that predates the field answers; another shape means
    // the body is not this contract at all.
    assert.equal(parseGiftRegistry(null), null);
    assert.equal(parseGiftRegistry(undefined), null);
  });

  it("refuses a body that grows the payload's version or another key", () => {
    for (const value of [
      { ...REGISTRY, version: 1 },
      { ...REGISTRY, extra: true },
      { stores: [STORE], transfer: TRANSFER, envelopes: true },
      [],
      "mesa",
    ]) {
      assert.equal(parseGiftRegistry(value), undefined, JSON.stringify(value));
    }
  });

  it("refuses a store or a transfer a write could not have stored", () => {
    const registryOf = (stores: unknown, transfer: unknown = null) =>
      parseGiftRegistry({ stores, transfer, envelopes: true, note: null });

    assert.equal(registryOf([{ name: "Liverpool" }]), undefined);
    assert.equal(registryOf([{ name: "", url: STORE.url }]), undefined);
    assert.equal(registryOf([{ name: "a".repeat(41), url: STORE.url }]), undefined);
    assert.equal(
      registryOf([{ name: "Liverpool", reference: "a".repeat(61), url: STORE.url }]),
      undefined,
    );
    assert.equal(registryOf([{ name: "Liverpool", url: "http://x.mx" }]), undefined);
    assert.equal(
      registryOf([{ name: "Liverpool", url: `https://x.mx/${"a".repeat(500)}` }]),
      undefined,
    );
    assert.equal(registryOf([{ ...STORE, extra: 1 }]), undefined);
    assert.equal(
      registryOf(Array.from({ length: GIFT_REGISTRY_MAX_STORES + 1 }, () => STORE)),
      undefined,
    );
    assert.equal(
      registryOf(Array.from({ length: GIFT_REGISTRY_MAX_STORES }, () => STORE))?.stores.length,
      8,
    );

    assert.equal(registryOf([], "BBVA"), undefined);
    assert.equal(registryOf([], { ...TRANSFER, bank: "" }), undefined);
    assert.equal(registryOf([], { ...TRANSFER, holder: "a".repeat(61) }), undefined);
    assert.equal(registryOf([], { ...TRANSFER, clabe: "012180000123456788" }), undefined);
  });

  it("keeps the note as a bounded text or null, and the envelopes flag as a boolean", () => {
    const longest = parseGiftRegistry({
      stores: [STORE],
      transfer: null,
      envelopes: true,
      note: "a".repeat(200),
    });

    assert.equal(longest === null || longest === undefined ? 0 : longest.note?.length, 200);
    assert.equal(
      parseGiftRegistry({
        stores: [STORE],
        transfer: null,
        envelopes: true,
        note: "a".repeat(201),
      }),
      undefined,
    );
    assert.equal(
      parseGiftRegistry({ stores: [STORE], transfer: null, envelopes: "true", note: null }),
      undefined,
    );
  });
});

describe("the owner's gift registry payload (F2; L4.1)", () => {
  it("reads the versioned payload the editor sends back, and treats an absent value as none", () => {
    const payload = {
      version: 1,
      stores: [STORE],
      transfer: TRANSFER,
      envelopes: true,
      note: "Con cariño",
    };

    assert.deepEqual(parseGiftRegistryPayload(payload), payload);
    assert.deepEqual(parseGiftRegistryPayload({ version: 1, stores: [], envelopes: false }), {
      version: 1,
      stores: [],
      envelopes: false,
    });
    assert.equal(parseGiftRegistryPayload(null), null);
    assert.equal(parseGiftRegistryPayload(undefined), null);
  });

  it("refuses another version, a wrong width, and a body that grows another key", () => {
    for (const value of [
      { version: 2, stores: [STORE], envelopes: true },
      { version: 1, stores: [STORE], envelopes: true, extra: 1 },
      { version: 1, stores: [STORE] },
      { stores: [STORE], envelopes: true },
      "mesa",
    ]) {
      assert.equal(parseGiftRegistryPayload(value), undefined, JSON.stringify(value));
    }
  });
});

describe("the public view of a stored payload (F2; L4.5)", () => {
  it("drops the version and answers a null transfer and note, so a card always reads the same keys", () => {
    assert.deepEqual(
      giftRegistryOf({
        version: 1,
        stores: [STORE],
        transfer: TRANSFER,
        envelopes: true,
        note: "Con cariño",
      }),
      REGISTRY,
    );
    assert.deepEqual(giftRegistryOf({ version: 1, stores: [STORE], envelopes: false }), {
      stores: [STORE],
      transfer: null,
      envelopes: false,
      note: null,
    });
  });
});

describe("a CLABE for reading (F2; L4.5)", () => {
  it("accepts an eighteen-digit CLABE with a valid control digit and refuses anything else", () => {
    for (const clabe of ["032180000118359719", "002180012345678906", "012180000123456782"]) {
      assert.equal(isClabe(clabe), true, clabe);
    }
    for (const clabe of [
      "032180000118359718",
      "01218000012345678",
      "01218000012345678a",
      "",
      null,
      12,
    ]) {
      assert.equal(isClabe(clabe), false, String(clabe));
    }
  });

  it("groups the digits for reading without changing them, and answers the value it was given", () => {
    assert.equal(clabeGroups("012180000123456782"), "0121 8000 0123 4567 82");
    assert.equal(clabeGroups("012180000123456782").replaceAll(" ", ""), "012180000123456782");
    // A value no CLABE has is answered as it came, so the card never hides what the API stored.
    assert.equal(clabeGroups("0123"), "0123");
  });
});

describe("the legacy text a structured registry replaces (F2; L4.3)", () => {
  const EMPTY = { stores: [], transfer: null, envelopes: false, note: null } as const;

  it("withholds the legacy content field only while the registry shows something", () => {
    assert.deepEqual(hideLegacyGiftRegistry([], REGISTRY), ["giftRegistry"]);
    assert.deepEqual(hideLegacyGiftRegistry(["message"], REGISTRY), ["message", "giftRegistry"]);
    assert.deepEqual(hideLegacyGiftRegistry([], EMPTY), []);
    assert.deepEqual(hideLegacyGiftRegistry([], null), []);
    assert.deepEqual(hideLegacyGiftRegistry(["giftRegistry"], REGISTRY), ["giftRegistry"]);
    // An envelopes-only registry is a registry: the line is the card.
    assert.deepEqual(hideLegacyGiftRegistry([], { ...EMPTY, envelopes: true }), ["giftRegistry"]);
  });

  it("answers whether a registry has anything a guest would see, on both shapes", () => {
    assert.equal(giftRegistryHasContent(REGISTRY), true);
    assert.equal(giftRegistryHasContent({ version: 1, stores: [STORE], envelopes: false }), true);
    assert.equal(giftRegistryHasContent(EMPTY), false);
    assert.equal(giftRegistryHasContent({ version: 1, stores: [], envelopes: false }), false);
    assert.equal(giftRegistryHasContent(null), false);
  });
});
