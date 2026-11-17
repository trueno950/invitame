import { create } from "qrcode";

/**
 * The access pass of a confirmed guest (M6 G4; S1, S4): the QR code of one absolute check-in URL, drawn on the
 * server as SVG. It is a pure function of the URL, so the page renders it with no client script, no network request,
 * and no third-party page: the guest's browser downloads one document and nothing else.
 *
 * `qrcode` (MIT) is pinned in `apps/web/package.json` for this one job. It is a vetted encoder that answers the
 * module matrix synchronously on the server, so the SVG is built here from that matrix instead of from a canvas, a
 * DOM, or an image encoder: no `pngjs`, no `canvas`, and no headless browser is involved. `lean-qr` stays what it
 * already was — the browser-side path renderer of the administrator enrollment QR — and neither library is used in
 * a client component of a guest page.
 *
 * What the pass carries: only the token the guest's own URL already holds, inside the check-in URL of the creator.
 * Nothing else — no name, no seats, no phone, no invitation id — so a screenshot of the pass leaks nothing the URL
 * does not. The markup is built only from numbers and fixed strings, which is what makes it safe to hand to an
 * `<img>` as a data URL; `app/_components/invitation-features/` does exactly that, so no page ever injects raw HTML.
 */

/** The quiet zone around the code, in modules: the 4 the specification asks for, so it scans on any background. */
export const QR_QUIET_ZONE = 4;

/** The error correction level of the pass: the middle one, which keeps the code small on a phone screen. */
const ERROR_CORRECTION = "M" as const;

/** The most characters one check-in URL may have; far above what the product builds, and a bound for the encoder. */
const MAX_URL_LENGTH = 512;

/**
 * The absolute http(s) URL a pass may encode, or undefined when the value is not one. A relative path, another
 * scheme, or a value with credentials or a fragment can never be a pass, so it is refused instead of drawn.
 */
export function guestPassUrl(value: string): string | undefined {
  if (value.length === 0 || value.length > MAX_URL_LENGTH) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.hash === ""
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The SVG of one pass: a white square, the quiet zone, and one path of dark module runs (`M x y h width v1 h-width z`).
 * The URL is re-validated here even though the page built it, so no other scheme can ever become a pass.
 */
export function guestPassSvg(value: string): string {
  const url = guestPassUrl(value);

  if (url === undefined) {
    throw new Error("a guest pass needs an absolute http(s) URL");
  }

  const { modules } = create(url, { errorCorrectionLevel: ERROR_CORRECTION });
  const size = modules.size;
  const total = size + 2 * QR_QUIET_ZONE;
  const runs: string[] = [];

  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (modules.data[y * size + x] !== 1) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && modules.data[y * size + x] === 1) {
        x += 1;
      }
      const width = x - start;
      runs.push(`M${start + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h${width}v1h-${width}z`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#FFFFFF"/><path fill="#000000" d="${runs.join("")}"/></svg>`;
}

/**
 * The same SVG as a data URL, so the page renders the pass with an `<img>`: an image document cannot run script, and
 * the page never needs raw HTML. The markup is percent-encoded, so the attribute it is written into stays intact.
 */
export function guestPassDataUrl(value: string): string {
  return `data:image/svg+xml,${encodeURIComponent(guestPassSvg(value))}`;
}
