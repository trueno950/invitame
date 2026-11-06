import { correction, generate } from "lean-qr";
import { toSvgPath } from "lean-qr/extras/svg";

/**
 * The enrollment QR code (M2 T8d; S36, L42), drawn in the browser with `lean-qr` from the TOTP URI
 * the enrollment answer already holds. Nothing is sent anywhere: `lean-qr` has no dependencies and
 * computes the matrix locally. The component renders the outline as inline SVG, so the URI never
 * becomes an image URL either.
 */

/** ISO/IEC 18004 asks for a light margin of 4 modules around the code. */
export const QR_QUIET_ZONE = 4;

export interface QrCodeOutline {
  /** Modules per side, without the quiet zone. */
  size: number;
  /** The SVG `viewBox`, including the quiet zone. */
  viewBox: string;
  /** The dark modules as one SVG path. */
  path: string;
}

export function qrCodeOutline(data: string): QrCodeOutline {
  // Medium correction keeps the code readable from a screen with glare or a partial scan.
  const code = generate(data, { minCorrectionLevel: correction.M });
  const span = code.size + 2 * QR_QUIET_ZONE;
  return {
    size: code.size,
    viewBox: `${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${span} ${span}`,
    path: toSvgPath(code),
  };
}
