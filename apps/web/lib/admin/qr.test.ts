import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { correction, generate } from "lean-qr";

import { QR_QUIET_ZONE, qrCodeOutline } from "./qr.ts";

// The enrollment QR code (M2 T8d; S36, L42): drawn in the browser with `lean-qr` from the TOTP URI
// the browser already holds, so the secret never reaches a third-party service.

const URI =
  "otpauth://totp/InvitaMe:admin%40example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSW&issuer=InvitaMe&digits=6&period=30";

describe("qrCodeOutline", () => {
  it("draws the URI's QR matrix as one SVG path with the standard 4-module quiet zone", () => {
    const outline = qrCodeOutline(URI);
    const matrix = generate(URI, { minCorrectionLevel: correction.M });

    assert.equal(QR_QUIET_ZONE, 4);
    assert.equal(outline.size, matrix.size);
    assert.ok(outline.size >= 21 && (outline.size - 17) % 4 === 0, String(outline.size));
    assert.equal(outline.viewBox, `-4 -4 ${outline.size + 8} ${outline.size + 8}`);
    assert.match(outline.path, /^M[0-9 LZM]+Z$/);
  });

  it("uses at least the medium error correction, so a phone camera reads it from a screen", () => {
    const low = generate(URI);
    assert.ok(qrCodeOutline(URI).size >= low.size);
  });

  it("is deterministic for one URI and differs for another", () => {
    assert.equal(qrCodeOutline(URI).path, qrCodeOutline(URI).path);
    assert.notEqual(qrCodeOutline(URI).path, qrCodeOutline(URI.replace("JBSW&", "JBSA&")).path);
  });
});
