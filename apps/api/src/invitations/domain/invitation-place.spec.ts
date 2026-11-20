import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addressFieldNames,
  composePlaceLabel,
  confirmedPlaces,
  isAddressFieldName,
  isLatitude,
  isLongitude,
  normalizePlaceQuery,
  PLACE_LABEL_ISSUE,
  PLACE_LABEL_MAX_LENGTH,
  PLACE_LAT_ISSUE,
  PLACE_LNG_ISSUE,
  PLACE_QUERY_LENGTH_ISSUE,
  PLACE_QUERY_TYPE_ISSUE,
  type StoredPlaces,
  validatePlaceWrite,
} from "./invitation-place";

// Precise locations (S1, S2): the rules the place search, the stored coordinates, and both reads share. They are
// pure, so every boundary — the query the owner types, the label and the coordinates a geocoder answers, and the
// one rule that decides whether a guest still sees a stored point — is proved here and nowhere else.

const SAN_JOSE = {
  label: "Parroquia de San José, Calle Hidalgo 12, Querétaro, Querétaro, México",
  lat: 20.5888,
  lng: -100.3899,
};

/** The schema a pinned version may declare, with the address fields a place may belong to. */
const SCHEMA = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", maxLength: 120 },
    location: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 240 },
    ceremonyPlace: { type: "string", maxLength: 120 },
    ceremonyAddress: { type: "string", maxLength: 240 },
    receptionAddress: { type: "string", maxLength: 240 },
    notes: { type: "string", maxLength: 240 },
  },
};

describe("place query (S2)", () => {
  it("trims the text the owner typed", () => {
    assert.deepEqual(normalizePlaceQuery("  Parroquia de San José  "), {
      ok: true,
      query: "Parroquia de San José",
    });
  });

  it("refuses a query shorter than three characters and longer than 120", () => {
    assert.deepEqual(normalizePlaceQuery("ab"), { ok: false, issue: PLACE_QUERY_LENGTH_ISSUE });
    assert.deepEqual(normalizePlaceQuery("   a   "), {
      ok: false,
      issue: PLACE_QUERY_LENGTH_ISSUE,
    });
    assert.deepEqual(normalizePlaceQuery(""), { ok: false, issue: PLACE_QUERY_LENGTH_ISSUE });
    assert.equal(normalizePlaceQuery("abc").ok, true);
    assert.equal(normalizePlaceQuery("a".repeat(120)).ok, true);
    assert.deepEqual(normalizePlaceQuery("a".repeat(121)), {
      ok: false,
      issue: PLACE_QUERY_LENGTH_ISSUE,
    });
  });

  it("refuses a value that is not a text", () => {
    for (const value of [undefined, null, 42, ["Querétaro"], { q: "Querétaro" }]) {
      assert.deepEqual(normalizePlaceQuery(value), { ok: false, issue: PLACE_QUERY_TYPE_ISSUE });
    }
  });
});

describe("address fields (S2)", () => {
  it("names the fields of the pinned schema whose name ends with Address, or is address", () => {
    assert.deepEqual(addressFieldNames(SCHEMA), ["address", "ceremonyAddress", "receptionAddress"]);
    // The rule reads the schema, never a template name: `location` is not an address field.
    assert.equal(isAddressFieldName("location"), false);
    assert.equal(isAddressFieldName("ceremonyPlace"), false);
    assert.equal(isAddressFieldName("address"), true);
    assert.equal(isAddressFieldName("receptionAddress"), true);
    assert.equal(isAddressFieldName("Address"), true);
    assert.equal(isAddressFieldName("myaddress"), false);
    assert.equal(isAddressFieldName(""), false);
    assert.equal(isAddressFieldName(undefined), false);
  });

  it("fails closed for a schema or value it cannot read", () => {
    assert.deepEqual(addressFieldNames(null), []);
    assert.deepEqual(addressFieldNames("nope"), []);
    assert.deepEqual(addressFieldNames({ type: "object" }), []);
    assert.deepEqual(addressFieldNames({ properties: { address: "not-an-object" } }), []);
    // Own properties only, so a declared `__proto__` never resolves through the prototype.
    assert.deepEqual(addressFieldNames({ properties: { __proto__: { type: "string" } } }), []);
  });
});

describe("stored place (S2, S3)", () => {
  it("range-checks the coordinates the database also checks", () => {
    assert.equal(isLatitude(-90), true);
    assert.equal(isLatitude(90), true);
    assert.equal(isLatitude(90.0001), false);
    assert.equal(isLatitude(-90.0001), false);
    assert.equal(isLatitude(Number.NaN), false);
    assert.equal(isLatitude("20.5"), false);
    assert.equal(isLongitude(-180), true);
    assert.equal(isLongitude(180), true);
    assert.equal(isLongitude(180.0001), false);
    assert.equal(isLongitude(null), false);
  });

  it("accepts the label and the coordinates a geocoder answered", () => {
    assert.deepEqual(validatePlaceWrite(SAN_JOSE), { ok: true, value: SAN_JOSE });
  });

  it("refuses a blank or oversized label, an out-of-range coordinate, and a value that is not a number", () => {
    const cases: Array<[{ label: unknown; lat: unknown; lng: unknown }, string]> = [
      [{ ...SAN_JOSE, label: "   " }, PLACE_LABEL_ISSUE],
      [{ ...SAN_JOSE, label: 42 }, PLACE_LABEL_ISSUE],
      [{ ...SAN_JOSE, label: "a".repeat(301) }, PLACE_LABEL_ISSUE],
      [{ ...SAN_JOSE, lat: 91 }, PLACE_LAT_ISSUE],
      [{ ...SAN_JOSE, lat: "20.5" }, PLACE_LAT_ISSUE],
      [{ ...SAN_JOSE, lng: -181 }, PLACE_LNG_ISSUE],
      [{ ...SAN_JOSE, lng: undefined }, PLACE_LNG_ISSUE],
    ];

    for (const [input, issue] of cases) {
      assert.deepEqual(
        validatePlaceWrite(input),
        { ok: false, issues: [issue] },
        JSON.stringify(input),
      );
    }
    // Every issue is reported, in a fixed order: label, lat, lng.
    assert.deepEqual(validatePlaceWrite({ label: "", lat: 200, lng: 200 }), {
      ok: false,
      issues: [PLACE_LABEL_ISSUE, PLACE_LAT_ISSUE, PLACE_LNG_ISSUE],
    });
  });

  it("composes a bounded label from the fields Photon answers and drops the empty ones", () => {
    assert.equal(
      composePlaceLabel(["Parroquia de San José", "Calle Hidalgo", "12", "Querétaro", "Querétaro"]),
      "Parroquia de San José, Calle Hidalgo, 12, Querétaro, Querétaro",
    );
    assert.equal(composePlaceLabel([null, "  ", "Calle Hidalgo", undefined]), "Calle Hidalgo");
    assert.equal(composePlaceLabel([null, undefined, ""]), null);
    assert.equal(composePlaceLabel(["a".repeat(400)])?.length, 300);
  });
});

describe("public places (S2)", () => {
  const content = {
    title: "Bautizo de Emilia",
    address: SAN_JOSE.label,
    ceremonyAddress: SAN_JOSE.label,
    receptionAddress: "Otra dirección que el dueño reescribió",
  };
  const stored = {
    address: SAN_JOSE,
    ceremonyAddress: { ...SAN_JOSE, lat: -20.5888 },
    receptionAddress: SAN_JOSE,
  };

  it("shows the stored point only while the address text still carries the label it was stored with", () => {
    assert.deepEqual(confirmedPlaces(stored, content, true), {
      address: SAN_JOSE,
      ceremonyAddress: { ...SAN_JOSE, lat: -20.5888 },
    });
  });

  it("shows nothing for a package the API did not gate MAP for", () => {
    assert.deepEqual(confirmedPlaces(stored, content, false), {});
  });

  it("ignores a field the content no longer holds, a value that is not text, and an invalid stored point", () => {
    assert.deepEqual(
      confirmedPlaces(
        {
          address: SAN_JOSE,
          ceremonyAddress: { ...SAN_JOSE, lat: 91 },
          notes: SAN_JOSE,
        },
        { address: SAN_JOSE.label, ceremonyAddress: SAN_JOSE.label, notes: SAN_JOSE.label },
        true,
      ),
      { address: SAN_JOSE },
    );
    assert.deepEqual(confirmedPlaces(stored, { address: 42 }, true), {});
  });

  it("skips a malformed stored point instead of throwing or showing an empty marker (S2, S3)", () => {
    const longLabel = "a".repeat(PLACE_LABEL_MAX_LENGTH + 1);
    // A row written around the API: a value that is not a point at all, a blank label the content also holds,
    // and a label wider than the column. Each one is no point for a guest, and none of them throws.
    const malformed = {
      address: null,
      ceremonyAddress: { ...SAN_JOSE, label: "   " },
      receptionAddress: { ...SAN_JOSE, label: longLabel },
    } as unknown as StoredPlaces;

    assert.deepEqual(
      confirmedPlaces(
        malformed,
        { address: SAN_JOSE.label, ceremonyAddress: "   ", receptionAddress: longLabel },
        true,
      ),
      {},
    );

    // A malformed row costs only its own point: a well-formed one next to it still reaches the guest.
    assert.deepEqual(
      confirmedPlaces(
        { ...malformed, address: SAN_JOSE } as unknown as StoredPlaces,
        {
          address: SAN_JOSE.label,
        },
        true,
      ),
      { address: SAN_JOSE },
    );
  });
});
