"use client";

import { useMemo } from "react";

import { qrCodeOutline } from "../../../lib/admin/qr.ts";

interface QrCodeProperties {
  /** The TOTP URI; it stays in this component's memory and the inline SVG it draws. */
  data: string;
  label: string;
}

/**
 * The enrollment QR code (M2 T8d; S36, L42), computed in the browser by `lean-qr` and drawn as inline
 * SVG in ink on white with the 4-module quiet zone, so no request, image URL, or third-party service
 * ever sees the URI.
 */
export function QrCode({ data, label }: QrCodeProperties) {
  const outline = useMemo(() => qrCodeOutline(data), [data]);

  return (
    <svg
      aria-label={label}
      className="block size-56 rounded-field bg-surface ring-1 ring-gold/45 sm:size-60"
      role="img"
      shapeRendering="crispEdges"
      viewBox={outline.viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path className="fill-ink" d={outline.path} />
    </svg>
  );
}
