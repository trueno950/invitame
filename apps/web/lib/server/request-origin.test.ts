import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestOrigin } from "./request-origin.ts";

// The origin of the request that renders a page (T9; S9). The chooser previews the real renderer with a
// fixed sample whose photo is an absolute http(s) address, because that is what the renderer's own content
// parser accepts, and the page never anchors that address to a configurable base URL. What the browser sent
// is trusted only as far as it forms a bare http(s) origin: anything else answers nothing, so a preview is
// dropped instead of pointing an image at a foreign address.

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("requestOrigin", () => {
  it("builds the origin from the forwarded protocol and the host", () => {
    assert.equal(
      requestOrigin(headers({ host: "invitame.test", "x-forwarded-proto": "https" })),
      "https://invitame.test",
    );
    assert.equal(
      requestOrigin(headers({ host: "localhost:3000", "x-forwarded-proto": "http" })),
      "http://localhost:3000",
    );
  });

  it("assumes http only for a loopback host and https for a public one", () => {
    assert.equal(requestOrigin(headers({ host: "localhost:3000" })), "http://localhost:3000");
    assert.equal(requestOrigin(headers({ host: "127.0.0.1:3000" })), "http://127.0.0.1:3000");
    assert.equal(requestOrigin(headers({ host: "invitame.test" })), "https://invitame.test");
  });

  it("reads the first hop of a forwarded protocol list", () => {
    assert.equal(
      requestOrigin(headers({ host: "invitame.test", "x-forwarded-proto": "https, http" })),
      "https://invitame.test",
    );
  });

  it("answers nothing for a host it cannot turn into a bare origin", () => {
    for (const entries of [
      {},
      { host: "" },
      { host: "invitame.test/evil" },
      { host: "invitame.test?x=1" },
      { host: "user@invitame.test" },
      { host: "invitame.test#frag" },
      { host: "a b" },
      { host: "javascript:alert(1)" },
      { host: "invitame.test", "x-forwarded-proto": "ftp" },
      { host: "invitame.test", "x-forwarded-proto": "javascript" },
    ]) {
      assert.equal(requestOrigin(headers(entries)), undefined, JSON.stringify(entries));
    }
  });
});
