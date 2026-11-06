/**
 * Fine-line ornaments of the theme (M2 T8t; S35): static SVG files in `public/ornaments`, drawn as
 * botanical engraving in wine and gold. They are decoration only, so screen readers skip them.
 * The intrinsic sizes keep the layout stable while the image loads.
 */
const ORNAMENTS = {
  /** A spray of roses, buds, leaves, and gold sprigs for the corners of a page. */
  corner: { src: "/ornaments/corner-floral.svg", width: 520, height: 420 },
  /** A gold flourish with a small wine flower in the middle, between a heading and its content. */
  divider: { src: "/ornaments/flourish-divider.svg", width: 320, height: 64 },
  /** A wine rose bud, the bullet of eyebrows and short lists. */
  bud: { src: "/ornaments/rose-bud.svg", width: 64, height: 64 },
  /** The small rose after the wordmark. */
  rose: { src: "/ornaments/wordmark-rose.svg", width: 20, height: 20 },
} as const;

export type OrnamentName = keyof typeof ORNAMENTS;

interface OrnamentProperties {
  name: OrnamentName;
  className?: string;
}

export function Ornament({ name, className }: OrnamentProperties) {
  const { src, width, height } = ORNAMENTS[name];
  return (
    // biome-ignore lint/performance/noImgElement: a static decorative SVG gains nothing from next/image.
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      draggable={false}
      height={height}
      src={src}
      width={width}
    />
  );
}
