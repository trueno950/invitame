import type { CSSProperties } from "react";

/**
 * Static drawings of the landing (M2 T8l; S35): fine-line flowers and sample stationery adapted from
 * the approved concept as SVG files in `public/ornaments`. They are decoration only, so screen readers
 * skip them; the intrinsic sizes keep the layout stable while each file loads.
 */
const ART = {
  /** The hero bouquet that draws itself; see `DrawnBouquet`. */
  bouquetDraw: { src: "/ornaments/bouquet-draw.svg", width: 520, height: 420 },
  /** The same bouquet, already drawn (the T8t corner ornament). */
  bouquet: { src: "/ornaments/corner-floral.svg", width: 520, height: 420 },
  envelope: { src: "/ornaments/envelope.svg", width: 400, height: 300 },
  envelopeSpray: { src: "/ornaments/envelope-spray.svg", width: 360, height: 170 },
  garland: { src: "/ornaments/garland.svg", width: 600, height: 150 },
  cardCorner: { src: "/ornaments/card-corner.svg", width: 220, height: 220 },
  petal: { src: "/ornaments/petal.svg", width: 40, height: 40 },
  crown: { src: "/ornaments/crown.svg", width: 90, height: 40 },
  balloons: { src: "/ornaments/balloons.svg", width: 100, height: 90 },
  bunting: { src: "/ornaments/bunting.svg", width: 200, height: 30 },
  iconTiara: { src: "/ornaments/icon-tiara.svg", width: 64, height: 64 },
  iconRings: { src: "/ornaments/icon-rings.svg", width: 64, height: 64 },
  iconBalloons: { src: "/ornaments/icon-balloons.svg", width: 64, height: 64 },
  iconCards: { src: "/ornaments/icon-cards.svg", width: 64, height: 64 },
  iconQuill: { src: "/ornaments/icon-quill.svg", width: 64, height: 64 },
  iconEnvelope: { src: "/ornaments/icon-envelope.svg", width: 64, height: 64 },
  iconCalendar: { src: "/ornaments/icon-calendar.svg", width: 64, height: 64 },
  iconPin: { src: "/ornaments/icon-pin.svg", width: 64, height: 64 },
  iconHeart: { src: "/ornaments/icon-heart.svg", width: 64, height: 64 },
} as const;

export type ArtName = keyof typeof ART;

/** The item of a non-empty list for a position, wrapping around; used to pair copy with drawings. */
export function pick<T>(list: readonly [T, ...T[]], index: number): T {
  return list[index % list.length] ?? list[0];
}

interface ArtProperties {
  name: ArtName;
  className?: string | undefined;
  style?: CSSProperties;
  /** Load at once: only for the drawings of the first screen. */
  eager?: boolean;
}

export function Art({ name, className, style, eager = false }: ArtProperties) {
  const { src, width, height } = ART[name];
  return (
    // biome-ignore lint/performance/noImgElement: a static decorative SVG gains nothing from next/image.
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      draggable={false}
      height={height}
      loading={eager ? "eager" : "lazy"}
      src={src}
      style={style}
      width={width}
    />
  );
}

/**
 * The hero bouquet that draws itself on load. The SVG file carries its own CSS: each stroke is
 * dashed with `pathLength="1"` and its dash offset runs to zero, staggered over about 2.9 s, so the
 * page ships no script and its HTML stays light. Chromium does not pass the page's reduced-motion
 * preference into an SVG image, so with `prefers-reduced-motion: reduce` the picture swaps to the same
 * bouquet already drawn. `className` positions the picture; the image fills it.
 */
export function DrawnBouquet({ className }: { className?: string | undefined }) {
  const drawn = ART.bouquet;
  const drawing = ART.bouquetDraw;
  return (
    <picture className={className}>
      <source media="(prefers-reduced-motion: reduce)" srcSet={drawn.src} />
      <img
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={drawing.height}
        src={drawing.src}
        width={drawing.width}
      />
    </picture>
  );
}
