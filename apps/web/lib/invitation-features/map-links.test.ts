import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { googleMapsUrl, wazeUrl } from "./map-links.ts";

// The «Cómo llegar» links of the guest page (S4): Google Maps and Waze per place, built from the layout's
// own address fields, with no embedded map and no API key. The place text is user content, so it is encoded
// for the query, never concatenated raw.

const PLACE = {
  label: "Ceremonia",
  name: "Parroquia San Miguel",
  address: "Calle Hidalgo 45, Centro, Querétaro",
};

const PLACE_WITH_RESERVED_CHARACTERS = {
  label: "Recepción",
  name: "Casa de los abuelos",
  address: "Calle 5 & 6 #12, «Jardín»",
};

/** The query the URL carries for `parameter`. */
function queryOf(href: string, parameter: string): string | null {
  return new URL(href).searchParams.get(parameter);
}

describe("Google Maps link", () => {
  it("searches for the place name and its address", () => {
    const href = googleMapsUrl(PLACE);
    const parsed = new URL(href);

    assert.equal(parsed.origin, "https://www.google.com");
    assert.equal(parsed.pathname, "/maps/search/");
    assert.equal(parsed.searchParams.get("api"), "1");
    assert.equal(
      queryOf(href, "query"),
      "Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro",
    );
  });

  it("encodes an address that carries characters a query cannot hold raw", () => {
    const href = googleMapsUrl(PLACE_WITH_RESERVED_CHARACTERS);

    assert.equal(queryOf(href, "query"), "Casa de los abuelos, Calle 5 & 6 #12, «Jardín»");
    assert.doesNotMatch(href, /[ "#«»]/);
    assert.equal((href.match(/&/g) ?? []).length, 1, "only the api parameter separator is raw");
  });

  it("keeps each place search separate", () => {
    assert.notEqual(googleMapsUrl(PLACE), googleMapsUrl(PLACE_WITH_RESERVED_CHARACTERS));
  });
});

describe("Waze link", () => {
  it("navigates to the place name and its address", () => {
    const href = wazeUrl(PLACE);
    const parsed = new URL(href);

    assert.equal(parsed.origin, "https://www.waze.com");
    assert.equal(parsed.pathname, "/ul");
    assert.equal(
      parsed.searchParams.get("q"),
      "Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro",
    );
    assert.equal(parsed.searchParams.get("navigate"), "yes");
  });

  it("encodes an address that carries characters a query cannot hold raw", () => {
    const href = wazeUrl(PLACE_WITH_RESERVED_CHARACTERS);

    assert.equal(queryOf(href, "q"), "Casa de los abuelos, Calle 5 & 6 #12, «Jardín»");
    assert.doesNotMatch(href, /[ "#«»]/);
  });
});
