import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { correction, generate } from "lean-qr";
import { toSvgPath } from "lean-qr/extras/svg";

import { QR_QUIET_ZONE, qrCodeOutline } from "./qr.ts";

// The enrollment QR code (M2 T8d; S36, L42): drawn in the browser with `lean-qr` from the TOTP URI
// the browser already holds, so the secret never reaches a third-party service.

const URI =
  "otpauth://totp/InvitaMe:admin%40example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSW&issuer=InvitaMe&digits=6&period=30";

describe("qrCodeOutline", () => {
  it("draws the URI's QR matrix as one SVG path with the standard 4-module quiet zone", () => {
    const outline = qrCodeOutline(URI);

    assert.equal(QR_QUIET_ZONE, 4);
    assert.ok(outline.size >= 21 && (outline.size - 17) % 4 === 0, String(outline.size));
    assert.equal(outline.viewBox, `-4 -4 ${outline.size + 8} ${outline.size + 8}`);
    assert.match(outline.path, /^M[0-9 LZM]+Z$/);
  });

  it("uses at least the medium error correction, so a phone camera reads it from a screen", () => {
    // The level the drawn code uses, found by drawing the URI at each single level. lean-qr may raise
    // the level above the floor when the version has room, so any level from medium up is right.
    const levels = { L: correction.L, M: correction.M, Q: correction.Q, H: correction.H };
    const drawnAt = (level: (typeof levels)[keyof typeof levels]) =>
      toSvgPath(generate(URI, { minCorrectionLevel: level, maxCorrectionLevel: level }));
    // Without a floor, lean-qr picks the smallest version at the lowest level; for this URI that
    // version is smaller than medium's, so a code drawn without the floor would match L only.
    assert.ok(generate(URI, { minCorrectionLevel: correction.M }).size > generate(URI).size);

    const path = qrCodeOutline(URI).path;
    const matching = Object.entries(levels)
      .filter(([, level]) => drawnAt(level) === path)
      .map(([name]) => name);

    assert.equal(matching.length, 1, `levels matching the drawn code: ${matching.join(", ")}`);
    assert.ok(["M", "Q", "H"].includes(matching[0] ?? ""), `drawn at ${matching[0]}`);
  });

  it("is deterministic for one URI and differs for another", () => {
    assert.equal(qrCodeOutline(URI).path, qrCodeOutline(URI).path);
    assert.notEqual(qrCodeOutline(URI).path, qrCodeOutline(URI.replace("JBSW&", "JBSA&")).path);
  });
});
