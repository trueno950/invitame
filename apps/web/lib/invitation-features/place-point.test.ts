import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confirmedPlaces,
  isAddressFieldName,
  isPlaceConfirmed,
  parsePlacePoints,
  parseStoredPlaces,
  storedPlaceOf,
} from "./place-point.ts";

// The stored point of one address field (S1, S2). The web reads two shapes from the API — the suggestions an owner
// picks from and the points stored per content field — and both carry the same bounds the API's own module states:
// a non-blank label of at most 300 characters and the two coordinates of a point on Earth.

const QUERETARO = { label: "Parroquia de San José, Querétaro", lat: 20.588793, lng: -100.389888 };

describe("one point", () => {
  it("is parsed from its documented shape", () => {
    assert.deepEqual(parsePlacePoints([QUERETARO]), [QUERETARO]);
  });

  it("is refused when its label is blank, oversized, or not a text", () => {
    for (const label of ["", "   ", "x".repeat(301), 7, null]) {
      assert.equal(parsePlacePoints([{ ...QUERETARO, label }]), undefined, String(label));
    }
    assert.notEqual(parsePlacePoints([{ ...QUERETARO, label: "x".repeat(300) }]), undefined);
  });

  it("is refused when a coordinate is out of range or not a finite number", () => {
    for (const point of [
      { ...QUERETARO, lat: 90.1 },
      { ...QUERETARO, lat: -91 },
      { ...QUERETARO, lng: 180.5 },
      { ...QUERETARO, lng: -181 },
      { ...QUERETARO, lat: "20.5" },
      { ...QUERETARO, lng: Number.NaN },
      { ...QUERETARO, lat: Number.POSITIVE_INFINITY },
    ]) {
      assert.equal(parsePlacePoints([point]), undefined);
    }
  });

  it("keeps the edges of both ranges", () => {
    assert.deepEqual(parsePlacePoints([{ label: "Polo", lat: 90, lng: 180 }]), [
      { label: "Polo", lat: 90, lng: 180 },
    ]);
    assert.deepEqual(parsePlacePoints([{ label: "Polo", lat: -90, lng: -180 }]), [
      { label: "Polo", lat: -90, lng: -180 },
    ]);
  });
});

describe("the suggestions of one search", () => {
  it("are at most five, as the listbox renders", () => {
    const six = Array.from({ length: 6 }, (_unused, index) => ({
      ...QUERETARO,
      label: `P${index}`,
    }));

    assert.equal(parsePlacePoints(six), undefined);
    assert.equal(parsePlacePoints(six.slice(0, 5))?.length, 5);
  });

  it("are refused whole when any entry is not a point, and an empty answer is an empty list", () => {
    assert.equal(parsePlacePoints([QUERETARO, { label: "Sin punto" }]), undefined);
    assert.equal(parsePlacePoints([])?.length, 0);
    assert.equal(parsePlacePoints({ 0: QUERETARO }), undefined);
    assert.equal(parsePlacePoints(null), undefined);
  });
});

describe("the stored points keyed by field", () => {
  it("are parsed per address field", () => {
    assert.deepEqual(parseStoredPlaces({ address: QUERETARO }), { address: QUERETARO });
    assert.deepEqual(parseStoredPlaces({}), {});
  });

  it("refuse a key that does not name an address field, like the API's own write rule", () => {
    assert.equal(parseStoredPlaces({ celebrantName: QUERETARO }), undefined);
    assert.equal(parseStoredPlaces({ ["x".repeat(65)]: QUERETARO }), undefined);
  });

  it("refuse a point that breaks the bounds of the column", () => {
    assert.equal(parseStoredPlaces({ address: { label: "", lat: 1, lng: 1 } }), undefined);
    assert.equal(parseStoredPlaces({ address: { label: "A", lat: 1 } }), undefined);
    assert.equal(parseStoredPlaces({ address: "Parroquia" }), undefined);
    assert.equal(parseStoredPlaces([]), undefined);
  });

  it("answer the point of one field, and nothing for any other", () => {
    const places = { ceremonyAddress: QUERETARO };

    assert.deepEqual(storedPlaceOf(places, "ceremonyAddress"), QUERETARO);
    assert.equal(storedPlaceOf(places, "receptionAddress"), undefined);
    assert.equal(storedPlaceOf(undefined, "ceremonyAddress"), undefined);
    assert.equal(storedPlaceOf(places, "constructor"), undefined);
  });
});

describe("an address field name", () => {
  it("is the bare `address` or a name ending in `Address`, as the API derives it from the schema", () => {
    assert.equal(isAddressFieldName("address"), true);
    assert.equal(isAddressFieldName("ceremonyAddress"), true);
    assert.equal(isAddressFieldName("receptionAddress"), true);
    assert.equal(isAddressFieldName("Address"), true);
    assert.equal(isAddressFieldName("addressLine"), false);
    assert.equal(isAddressFieldName(""), false);
    assert.equal(isAddressFieldName("x".repeat(65)), false);
    assert.equal(isAddressFieldName(3), false);
  });
});

describe("the confirmed rule", () => {
  it("holds only while the stored label equals the text the field holds now", () => {
    assert.equal(isPlaceConfirmed(QUERETARO, QUERETARO.label), true);
    assert.equal(isPlaceConfirmed(QUERETARO, `${QUERETARO.label} `), false);
    assert.equal(isPlaceConfirmed(QUERETARO, "Parroquia de San José"), false);
    assert.equal(isPlaceConfirmed(QUERETARO, undefined), false);
    assert.equal(isPlaceConfirmed(QUERETARO, 7), false);
    assert.equal(isPlaceConfirmed(undefined, QUERETARO.label), false);
  });

  it("keeps the points a reader may use and drops the rest of the stored map", () => {
    const places = {
      address: { label: "Calle Reforma 123", lat: 19.43, lng: -99.13 },
      ceremonyAddress: QUERETARO,
      receptionAddress: { label: "Casa vieja", lat: 20.6, lng: -100.4 },
    };
    const content = { address: "Calle Reforma 123", ceremonyAddress: QUERETARO.label };

    assert.deepEqual(confirmedPlaces(places, content), {
      address: places.address,
      ceremonyAddress: QUERETARO,
    });
  });

  it("keeps nothing when the content rewrote the address, and nothing for a missing map", () => {
    assert.deepEqual(confirmedPlaces({ address: QUERETARO }, { address: "Otra dirección" }), {});
    assert.deepEqual(confirmedPlaces(undefined, { address: QUERETARO.label }), {});
    assert.deepEqual(confirmedPlaces({ address: QUERETARO }, undefined), {});
  });
});
