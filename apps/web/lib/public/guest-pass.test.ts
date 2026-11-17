import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  afterSignInPath,
  checkInPath,
  checkInUrl,
  guestShareUrl,
  isCheckInPath,
  personalGuestPath,
} from "./guest-pass.ts";

// The addresses of a guest's personal link, the pass it shows, and the page a signed-out owner returns to
// (M6 G4; S4). The API's public read never exposes the invitation id, so the pass encodes the *owner's* path that
// names the invitation by its public slug and resolves the id on the owner's side; the same rule keeps the
// after-sign-in hand-off a bare path this deployment can re-validate before it redirects to it.

const SLUG = "invitacion-k7m2qx";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

describe("personal link", () => {
  it("builds the guest's own page from the slug and the opaque token", () => {
    assert.equal(personalGuestPath(SLUG, TOKEN), `/i/${SLUG}/g/${TOKEN}`);
  });

  it("answers nothing for a slug or token that cannot be one", () => {
    for (const [slug, token] of [
      ["Invitacion", TOKEN],
      ["../cuenta", TOKEN],
      [SLUG, ""],
      [SLUG, "corto"],
      [SLUG, `${TOKEN.slice(0, 21)}/`],
      [SLUG, `${TOKEN}=`],
    ] as const) {
      assert.equal(personalGuestPath(slug, token), undefined, token);
    }
  });
});

describe("check-in address", () => {
  it("names the invitation by its public slug, because the public read carries no id", () => {
    assert.equal(checkInPath(SLUG, TOKEN), `/cuenta/acceso/${SLUG}/${TOKEN}`);
  });

  it("builds the absolute URL the pass encodes", () => {
    assert.equal(
      checkInUrl("http://localhost:3000", SLUG, TOKEN),
      `http://localhost:3000/cuenta/acceso/${SLUG}/${TOKEN}`,
    );
  });

  it("answers nothing for an origin that is not a bare http(s) one", () => {
    for (const origin of [
      "",
      "localhost:3000",
      "javascript:alert(1)",
      "http://x/y",
      "http://x?q=1",
    ]) {
      assert.equal(checkInUrl(origin, SLUG, TOKEN), undefined, origin);
    }
  });

  it("answers nothing for a slug or token that cannot be one", () => {
    assert.equal(checkInUrl("http://localhost:3000", "Invitacion", TOKEN), undefined);
    assert.equal(checkInUrl("http://localhost:3000", SLUG, "corto"), undefined);
  });

  it("recognizes exactly the path it builds, so a hand-edited return target is refused", () => {
    const path = checkInPath(SLUG, TOKEN);

    assert.equal(isCheckInPath(path), true);
    assert.equal(isCheckInPath(`${path}/ingresar`), false);

    for (const value of [
      "",
      "/cuenta",
      "/cuenta/acceso",
      `/cuenta/acceso/${SLUG}`,
      `/cuenta/acceso/${SLUG}/${TOKEN}/`,
      `/cuenta/acceso/${SLUG}/${TOKEN}?x=1`,
      `//cuenta/acceso/${SLUG}/${TOKEN}`,
      `/cuenta/acceso/${SLUG}/${TOKEN}#x`,
      `/i/${SLUG}/g/${TOKEN}`,
      `/cuenta/invitaciones/0b8f2a3c-4d5e-4f60-8a91-2b3c4d5e6f70/asistencia`,
      `http://evil.example/cuenta/acceso/${SLUG}/${TOKEN}`,
      `/cuenta/acceso/Invitacion/${TOKEN}`,
      `/cuenta/acceso/${SLUG}/corto`,
      null,
      7,
    ]) {
      assert.equal(isCheckInPath(value), false, String(value));
    }
  });

  it("sends a signed-out owner through the sign-in return path of the same check-in address", () => {
    assert.equal(afterSignInPath(SLUG, TOKEN), `/cuenta/acceso/${SLUG}/${TOKEN}/ingresar`);
    assert.equal(afterSignInPath("Invitacion", TOKEN), undefined);
  });
});

describe("share link", () => {
  it("prefills a WhatsApp message with the guest's name and personal link", () => {
    const personal = `/i/${SLUG}/g/${TOKEN}`;
    const url = guestShareUrl("Ana", `http://localhost:3000${personal}`);

    assert.ok(url !== undefined);
    const parsed = new URL(url);

    assert.equal(parsed.origin, "https://wa.me");
    assert.equal(parsed.pathname, "/");

    const text = parsed.searchParams.get("text") ?? "";
    assert.ok(text.includes("Ana"), text);
    assert.ok(text.includes(`http://localhost:3000${personal}`), text);
    // The guest's neutral Spanish copy, never a promise of delivery.
    assert.ok(text.startsWith("Hola Ana,"), text);
  });

  it("refuses to build a share link out of anything but an absolute personal URL", () => {
    for (const url of ["", "/i/a/g/b", "javascript:alert(1)", "ftp://x/y"]) {
      assert.equal(guestShareUrl("Ana", url), undefined, url);
    }
  });
});
