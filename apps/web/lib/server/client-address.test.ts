import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientAddressFor } from "./client-address.ts";

// The guest's address as the web server forwards it to the API (M6 G3; S4). It is the address the API's RSVP
// rate limit counts against, so the web reads it from the incoming request's headers, never from the form, and
// only forwards a value that is one real address; anything else is dropped so the API falls back on its own.

const CONFIG = {
  clientIpHeader: "x-invitame-client-ip",
  edgeClientIpHeader: "x-real-ip",
} as const;

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("clientAddressFor", () => {
  it("takes the single address the platform edge wrote", () => {
    assert.equal(clientAddressFor(headers({ "x-real-ip": "203.0.113.7" }), CONFIG), "203.0.113.7");
    assert.equal(clientAddressFor(headers({ "x-real-ip": "2001:db8::1" }), CONFIG), "2001:db8::1");
  });

  it("falls back to the first hop of the API's client IP header when the edge one is unusable", () => {
    assert.equal(
      clientAddressFor(headers({ "x-invitame-client-ip": "198.51.100.4, 10.0.0.1" }), CONFIG),
      "198.51.100.4",
    );
    assert.equal(
      clientAddressFor(
        headers({ "x-real-ip": "not-an-ip", "x-invitame-client-ip": " 198.51.100.4 , 10.0.0.1" }),
        CONFIG,
      ),
      "198.51.100.4",
    );
    // The edge header is one address by contract; a list there is not one and is refused whole.
    assert.equal(
      clientAddressFor(
        headers({ "x-real-ip": "203.0.113.7, 10.0.0.1", "x-invitame-client-ip": "198.51.100.4" }),
        CONFIG,
      ),
      "198.51.100.4",
    );
  });

  it("answers nothing rather than a bucket of its own when no usable address arrives", () => {
    assert.equal(clientAddressFor(headers({}), CONFIG), undefined);
    assert.equal(clientAddressFor(headers({ "x-real-ip": " " }), CONFIG), undefined);
    assert.equal(clientAddressFor(headers({ "x-real-ip": "unknown" }), CONFIG), undefined);
    assert.equal(
      clientAddressFor(headers({ "x-invitame-client-ip": "10.0.0.1, 10.0.0.2" }), CONFIG),
      "10.0.0.1",
    );
  });

  it("reads only the two configured headers, never one a browser chooses for itself", () => {
    assert.equal(
      clientAddressFor(headers({ "x-forwarded-for": "203.0.113.7" }), CONFIG),
      undefined,
    );
    assert.equal(clientAddressFor(headers({ forwarded: "for=203.0.113.7" }), CONFIG), undefined);
  });
});
