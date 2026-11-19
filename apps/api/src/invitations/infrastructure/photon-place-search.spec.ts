import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PHOTON_MEXICO_BIAS,
  PHOTON_RESULT_LIMIT,
  PHOTON_USER_AGENT,
  PhotonPlaceSearch,
  photonPlaces,
} from "./photon-place-search";

// The Photon adapter of the place search port (S2, S3): one bounded request for the text an owner is typing, and a
// strict reading of the GeoJSON answer. The suite injects `fetch`, so no test reaches the network; it observes the
// request the adapter builds and every way an answer can be unusable.

const BASE_URL = "https://photon.example.test/api/";

const SAN_JOSE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-100.3899, 20.5888] },
  properties: {
    name: "Parroquia de San José",
    street: "Calle Hidalgo",
    housenumber: "12",
    city: "Querétaro",
    state: "Querétaro",
    country: "México",
  },
};

const SAN_JOSE_LABEL = "Parroquia de San José, Calle Hidalgo, 12, Querétaro, Querétaro";

/** A `fetch` that records the request and answers the given body, status, and headers. */
function answeringFetch(
  body: unknown,
  response: { status?: number; headers?: Record<string, string> } = {},
): { fetch: typeof fetch; requests: Array<{ url: string; init: RequestInit }> } {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, {
      status: response.status ?? 200,
      headers: { "content-type": "application/json", ...response.headers },
    });
  }) as unknown as typeof fetch;

  return { fetch: fake, requests };
}

function searchWith(
  body: unknown,
  options: { status?: number; headers?: Record<string, string>; timeoutMs?: number } = {},
) {
  const fake = answeringFetch(body, options);
  const provider = new PhotonPlaceSearch({
    baseUrl: BASE_URL,
    fetch: fake.fetch,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });

  return { provider, requests: fake.requests };
}

describe("Photon place search (S2)", () => {
  it("asks the configured instance once, with the bounded result count and a Mexico bias", async () => {
    const { provider, requests } = searchWith({ type: "FeatureCollection", features: [SAN_JOSE] });

    await provider.search("Parroquia de San José");

    assert.equal(requests.length, 1);
    const target = new URL(requests[0]?.url ?? "");
    assert.equal(`${target.origin}${target.pathname}`, BASE_URL);
    assert.equal(target.searchParams.get("q"), "Parroquia de San José");
    assert.equal(target.searchParams.get("limit"), String(PHOTON_RESULT_LIMIT));
    // No `lang`: the public instance answers 400 to `es` and accepts only default, de, en, and fr.
    assert.equal(target.searchParams.get("lang"), null);
    // The bias is what keeps a Mexican address ahead of a namesake elsewhere; it is a documented constant.
    assert.equal(target.searchParams.get("lat"), String(PHOTON_MEXICO_BIAS.lat));
    assert.equal(target.searchParams.get("lon"), String(PHOTON_MEXICO_BIAS.lon));
    assert.equal(target.searchParams.get("zoom"), String(PHOTON_MEXICO_BIAS.zoom));

    const init = requests[0]?.init ?? {};
    // A redirect would leave the configured instance, so one is never followed.
    assert.equal(init.redirect, "manual");
    assert.equal((init.headers as Record<string, string>)["User-Agent"], PHOTON_USER_AGENT);
    assert.ok(init.signal instanceof AbortSignal, "a timeout signal bounds the request");
  });

  it("reads the point, the coordinates, and the label of every feature, in the answer's order", async () => {
    const { provider } = searchWith({
      type: "FeatureCollection",
      features: [
        SAN_JOSE,
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-99.1332, 19.4326] },
          properties: { name: "Zócalo", city: "Ciudad de México" },
        },
      ],
    });

    assert.deepEqual(await provider.search("parroquia"), [
      { label: SAN_JOSE_LABEL, lat: 20.5888, lng: -100.3899 },
      { label: "Zócalo, Ciudad de México", lat: 19.4326, lng: -99.1332 },
    ]);
  });

  it("answers no suggestion for an empty collection", async () => {
    const { provider } = searchWith({ type: "FeatureCollection", features: [] });

    assert.deepEqual(await provider.search("querétaro"), []);
  });

  it("answers nothing for an answer that is not a GeoJSON FeatureCollection", async () => {
    for (const body of [
      { type: "FeatureCollection" },
      { features: [SAN_JOSE] },
      { type: "FeatureCollection", features: "many" },
      [],
      "not json at all",
      "",
    ]) {
      const { provider } = searchWith(body);
      assert.deepEqual(await provider.search("querétaro"), [], JSON.stringify(body));
    }
  });

  it("skips a feature whose coordinates are out of range or whose geometry is not a point", async () => {
    const { provider } = searchWith({
      type: "FeatureCollection",
      features: [
        { ...SAN_JOSE, geometry: { type: "Point", coordinates: [-200, 20] } },
        { ...SAN_JOSE, geometry: { type: "Point", coordinates: [20, 95] } },
        { ...SAN_JOSE, geometry: { type: "Point", coordinates: [20] } },
        { ...SAN_JOSE, geometry: { type: "LineString", coordinates: [20, 20] } },
        { ...SAN_JOSE, geometry: null },
        // A feature that names nothing has nothing to write into an address field.
        { type: "Feature", geometry: { type: "Point", coordinates: [-100, 20] }, properties: {} },
        SAN_JOSE,
      ],
    });

    assert.deepEqual(await provider.search("querétaro"), [
      { label: SAN_JOSE_LABEL, lat: 20.5888, lng: -100.3899 },
    ]);
  });

  it("keeps at most five suggestions even when the instance answers more", async () => {
    const features = Array.from({ length: 8 }, (_unused, index) => ({
      ...SAN_JOSE,
      properties: { name: `Lugar ${index}` },
    }));
    const { provider } = searchWith({ type: "FeatureCollection", features });

    const answer = await provider.search("lugar");

    assert.equal(answer.length, PHOTON_RESULT_LIMIT);
    assert.equal(answer[0]?.label, "Lugar 0");
  });

  it("answers nothing for a refused request, for a network failure, and for an oversized body", async () => {
    const refused = searchWith(
      { type: "FeatureCollection", features: [SAN_JOSE] },
      { status: 503 },
    );
    assert.deepEqual(await refused.provider.search("querétaro"), []);

    const failing = new PhotonPlaceSearch({
      baseUrl: BASE_URL,
      fetch: (async () => {
        throw new TypeError("connect ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    assert.deepEqual(await failing.search("querétaro"), []);

    // The declared length is refused before a byte is read.
    const declared = searchWith(
      { type: "FeatureCollection", features: [SAN_JOSE] },
      {
        headers: { "content-length": String(64 * 1024 + 1) },
      },
    );
    assert.deepEqual(await declared.provider.search("querétaro"), []);
  });

  it("abandons a request that takes longer than the timeout", async () => {
    const provider = new PhotonPlaceSearch({
      baseUrl: BASE_URL,
      timeoutMs: 5,
      fetch: ((_input: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        })) as unknown as typeof fetch,
    });

    assert.deepEqual(await provider.search("querétaro"), []);
  });
});

describe("Photon GeoJSON reading", () => {
  it("is a pure function of the answer", () => {
    assert.deepEqual(photonPlaces({ type: "FeatureCollection", features: [SAN_JOSE] }), [
      { label: SAN_JOSE_LABEL, lat: 20.5888, lng: -100.3899 },
    ]);
    assert.deepEqual(photonPlaces(null), []);
    assert.deepEqual(
      photonPlaces({ type: "FeatureCollection", features: [{ properties: {} }] }),
      [],
    );
  });
});
