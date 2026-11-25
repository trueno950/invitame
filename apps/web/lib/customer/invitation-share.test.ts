import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INVITATION_COPY } from "./copy.ts";
import {
  absolutePublicUrl,
  shareMessage,
  WHATSAPP_SHARE_ENDPOINT,
  whatsappShareHref,
} from "./invitation-share.ts";

// The share panel of a published invitation (T1; S2.2): the absolute link the owner sends, the neutral Spanish message
// that goes with it, and the WhatsApp link that carries both. The address is built from the request origin the page
// resolved, never from a hardcoded host, so a preview deployment shares its own address.

describe("absolutePublicUrl", () => {
  it("puts the request origin in front of the public path", () => {
    assert.equal(
      absolutePublicUrl("https://invitame.mx", "/i/ana-y-beto"),
      "https://invitame.mx/i/ana-y-beto",
    );
    assert.equal(
      absolutePublicUrl("http://localhost:3000", "/i/ana"),
      "http://localhost:3000/i/ana",
    );
  });

  it("tolerates an origin with a trailing slash and a path with its own", () => {
    assert.equal(absolutePublicUrl("https://invitame.mx/", "/i/ana"), "https://invitame.mx/i/ana");
    assert.equal(absolutePublicUrl("https://invitame.mx", "i/ana"), "https://invitame.mx/i/ana");
  });

  it("keeps the path alone when the page resolved no trustworthy origin", () => {
    assert.equal(absolutePublicUrl(undefined, "/i/ana"), "/i/ana");
    assert.equal(absolutePublicUrl("", "/i/ana"), "/i/ana");
  });

  it("refuses an origin that is not a bare http(s) one, so the link never points elsewhere", () => {
    for (const origin of [
      "javascript:alert(1)",
      "data:text/html,<p>",
      "/relative",
      "https://invitame.mx/path",
      "https://invitame.mx?query=1",
      "ftp://invitame.mx",
    ]) {
      assert.equal(absolutePublicUrl(origin, "/i/ana"), "/i/ana", origin);
    }
  });
});

describe("shareMessage", () => {
  it("writes one neutral Spanish line with the absolute link", () => {
    const message = shareMessage("https://invitame.mx/i/ana");

    assert.equal(message, INVITATION_COPY.shareWhatsAppMessage("https://invitame.mx/i/ana"));
    assert.match(message, /https:\/\/invitame\.mx\/i\/ana/);
    assert.doesNotMatch(message, /\b(usted|ustedes)\b/i);
    assert.ok(!message.includes("—"));
  });
});

describe("whatsappShareHref", () => {
  it("carries the message as the one query value of the WhatsApp share endpoint", () => {
    const href = whatsappShareHref("https://invitame.mx/i/ana");
    const parsed = new URL(href);

    assert.equal(`${parsed.origin}${parsed.pathname}`, WHATSAPP_SHARE_ENDPOINT);
    assert.equal(parsed.searchParams.get("text"), shareMessage("https://invitame.mx/i/ana"));
    assert.ok(href.startsWith("https://wa.me/?text="));
  });

  it("encodes the link instead of letting it break the query", () => {
    const href = whatsappShareHref("https://invitame.mx/i/ana?x=1&y=2");

    assert.ok(!href.includes("ana?x=1&y=2"));
    assert.equal(
      new URL(href).searchParams.get("text"),
      shareMessage("https://invitame.mx/i/ana?x=1&y=2"),
    );
  });
});
