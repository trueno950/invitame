import assert from "node:assert/strict";
import { describe, it } from "node:test";

import nextConfig, { INVITATION_FRAME_SRC, WEB_REQUEST_BODY_LIMIT } from "../../next.config.ts";

// A photo upload is a server action on a `/cuenta` page, so Next's own body limits answer before the API does (M9
// T13; S8). This pins both at the API's 16 MB upload request cap, so a configured 15 MB photo is not refused by the
// web server's 1 MB server-action default or its 10 MB proxy default.
describe("the web server's request body limits", () => {
  it("accepts a server-action body up to the API's 16 MB upload request cap", () => {
    assert.equal(WEB_REQUEST_BODY_LIMIT, "16mb");
    assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, "16mb");
  });

  it("accepts the same body through the session proxy", () => {
    assert.equal(nextConfig.experimental?.proxyClientMaxBodySize, "16mb");
  });
});

// The guest page frames the livestream player on YouTube's privacy-enhanced host and nothing else (F9; L12.3, L12.4). The
// header is additive (only `frame-src`), scoped to the invitation pages, so no other page's framing changes.
describe("the invitation page's Content Security Policy", () => {
  it("allows only the livestream embed origin as a frame source", async () => {
    assert.equal(INVITATION_FRAME_SRC, "https://www.youtube-nocookie.com");

    const headers = (await nextConfig.headers?.()) ?? [];
    const granted = headers.find((entry) => entry.source === "/i/:path*");

    assert.ok(granted !== undefined, JSON.stringify(headers));
    assert.deepEqual(granted.headers, [
      {
        key: "Content-Security-Policy",
        value: "frame-src https://www.youtube-nocookie.com",
      },
    ]);
  });
});
