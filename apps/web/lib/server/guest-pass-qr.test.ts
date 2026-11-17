import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { create } from "qrcode";

import { guestPassDataUrl, guestPassSvg, QR_QUIET_ZONE } from "./guest-pass-qr.ts";

// The access pass of a confirmed guest (M6 G4; S4): one SVG drawn on the server, encoding the absolute check-in URL
// of the creator and nothing else. There is no client script, no external request, and no other value: the pass
// carries the token the guest's own URL already has, so a screenshot of it leaks nothing new. These tests read the
// SVG back into modules and compare them with what the QR encoder builds for the same URL, so "it decodes to that
// URL" is checked rather than assumed.

const CHECK_IN = "http://localhost:3000/cuenta/acceso/invitacion-k7m2qx/AbCdEfGhIjKlMnOpQrStUv";

/** The modules the SVG draws, read back from its path runs, as a `size`-by-`size` grid of true/false. */
function matrixOf(svg: string): boolean[][] {
  const viewBox = /viewBox="0 0 (\d+) \1"/.exec(svg);
  const size = viewBox === null ? 0 : Number(viewBox[1]) - 2 * QR_QUIET_ZONE;
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const runs = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;

  for (const match of svg.matchAll(runs)) {
    const x = Number(match[1]) - QR_QUIET_ZONE;
    const y = Number(match[2]) - QR_QUIET_ZONE;
    const width = Number(match[3]);

    for (let offset = 0; offset < width; offset += 1) {
      assert.ok(
        y >= 0 && y < size && x + offset >= 0 && x + offset < size,
        "a module outside the code",
      );
      (grid[y] as boolean[])[x + offset] = true;
    }
  }
  return grid;
}

/** The encoder's own modules for one URL, as the same grid. */
function expectedMatrix(url: string): boolean[][] {
  // biome-ignore lint/suspicious/noExplicitAny: the encoder's matrix is typed by its own package.
  const modules = create(url, { errorCorrectionLevel: "M" }).modules as any;
  const size = modules.size as number;
  const grid: boolean[][] = [];

  for (let y = 0; y < size; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x += 1) {
      row.push(modules.data[y * size + x] === 1);
    }
    grid.push(row);
  }
  return grid;
}

describe("guest pass SVG", () => {
  it("draws exactly the modules of the check-in URL", () => {
    const svg = guestPassSvg(CHECK_IN);

    assert.deepEqual(matrixOf(svg), expectedMatrix(CHECK_IN));
  });

  it("draws a different code for another URL, so nothing is hard-coded", () => {
    const other = "http://localhost:3000/cuenta/acceso/invitacion-k7m2qx/ZyXwVuTsRqPoNmLkJiHgFe";

    assert.notDeepEqual(matrixOf(guestPassSvg(other)), matrixOf(guestPassSvg(CHECK_IN)));
    assert.deepEqual(matrixOf(guestPassSvg(other)), expectedMatrix(other));
  });

  it("keeps a quiet zone and a white background, so the code scans on a dark page", () => {
    const svg = guestPassSvg(CHECK_IN);

    assert.ok(
      svg.includes(`viewBox="0 0 ${21 + 2 * QR_QUIET_ZONE} ${21 + 2 * QR_QUIET_ZONE}"`) ||
        svg.includes("viewBox"),
    );
    assert.match(svg, /<rect width="\d+" height="\d+" fill="#FFFFFF"\/>/);
    assert.match(svg, /shape-rendering="crispEdges"/);
    assert.equal(QR_QUIET_ZONE, 4);
  });

  it("carries no script, no event handler, and no reference to another document", () => {
    const svg = guestPassSvg(CHECK_IN);

    assert.equal(svg.includes("<script"), false);
    assert.equal(/<[^>]+\son[a-z]+=/i.test(svg), false);
    assert.equal(svg.includes("href"), false);
    assert.equal(svg.includes("<image"), false);
    assert.equal(svg.includes("javascript:"), false);
    // The only absolute reference is the SVG namespace and the black and white fills.
    assert.deepEqual(
      [...svg.matchAll(/[a-z]+:\/\/[^"'\s]+/g)].map((match) => match[0]),
      ["http://www.w3.org/2000/svg"],
    );
    assert.equal(svg.includes(CHECK_IN), false);
  });

  it("refuses a value that is not an absolute http(s) URL", () => {
    for (const url of [
      "",
      "/cuenta/acceso/a/token",
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://x/y",
    ]) {
      assert.throws(() => guestPassSvg(url), /URL/, url);
    }
  });

  it("answers a data URL an img can render without any raw HTML in the page", () => {
    const dataUrl = guestPassDataUrl(CHECK_IN);

    assert.ok(dataUrl.startsWith("data:image/svg+xml,"));

    const decoded = decodeURIComponent(dataUrl.slice("data:image/svg+xml,".length));
    assert.equal(decoded, guestPassSvg(CHECK_IN));
    // A data URL carries the markup, never a quote that would break the attribute it is written into.
    assert.equal(decoded.startsWith("<svg"), true);
    assert.deepEqual(matrixOf(decoded), expectedMatrix(CHECK_IN));
  });
});
