// The themed baptism theme allow-list (S13): a theme is an allow-listed set of palette, licensed fonts, and
// original illustrations that the `baptism-classic-01` layout applies. The registry never resolves a theme
// from the database, so a `componentKey` and a theme both select reviewed code and nothing else. Names stay
// generic: no character, brand, or protected name appears in a key (S5). The order is the one the owner
// approved on `design/celebration-themes/02-bautizo-tematico.html`.
export const BAPTISM_THEMES = [
  "dove-olive",
  "little-angels",
  "sky-clouds",
  "soft-floral",
  "little-lamb",
  "star-light",
] as const;

export type BaptismTheme = (typeof BAPTISM_THEMES)[number];
