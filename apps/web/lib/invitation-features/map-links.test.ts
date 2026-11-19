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

// The confirmed point (S1, S2): once the owner picks a suggestion, both services are asked for the coordinates
// instead of the words, so a misspelled address no longer lands nowhere. The text stays the fallback.

const WITH_POINT = { ...PLACE, lat: 20.588793, lng: -100.389888 };

describe("a place with a confirmed point", () => {
  it("asks Google Maps for the coordinates instead of the text", () => {
    const href = googleMapsUrl(WITH_POINT);
    const parsed = new URL(href);

    assert.equal(parsed.origin, "https://www.google.com");
    assert.equal(parsed.pathname, "/maps/search/");
    assert.equal(parsed.searchParams.get("api"), "1");
    assert.equal(parsed.searchParams.get("query"), "20.588793,-100.389888");
  });

  it("navigates Waze to the same coordinates", () => {
    const href = wazeUrl(WITH_POINT);
    const parsed = new URL(href);

    assert.equal(parsed.origin, "https://www.waze.com");
    assert.equal(parsed.pathname, "/ul");
    assert.equal(parsed.searchParams.get("ll"), "20.588793,-100.389888");
    assert.equal(parsed.searchParams.get("navigate"), "yes");
    // The point is the whole query: no text search travels beside it.
    assert.equal(parsed.searchParams.get("q"), null);
  });

  it("rounds a coordinate to the six decimals a point needs", () => {
    const href = googleMapsUrl({ ...PLACE, lat: 20.58879349, lng: -100.38988801 });

    assert.equal(queryOf(href, "query"), "20.588793,-100.389888");
  });

  it("keeps the text search when the point is incomplete or outside its range", () => {
    for (const place of [
      { ...PLACE, lat: 20.588793 },
      { ...PLACE, lng: -100.389888 },
      { ...PLACE, lat: 91, lng: -100.389888 },
      { ...PLACE, lat: 20.588793, lng: -181 },
      { ...PLACE, lat: Number.NaN, lng: -100.389888 },
    ]) {
      assert.equal(
        queryOf(googleMapsUrl(place), "query"),
        "Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro",
      );
      assert.equal(
        queryOf(wazeUrl(place), "q"),
        "Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro",
      );
    }
  });
});
