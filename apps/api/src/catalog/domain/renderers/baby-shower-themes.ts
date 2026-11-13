// The baby shower theme allow-list (S13): a theme is an allow-listed set of palette, licensed fonts, and
// original illustrations that the `baby-shower-classic-01` layout applies. The registry never resolves a
// theme from the database, so a `componentKey` and a theme both select reviewed code and nothing else. Names
// stay generic: no character, brand, or protected name appears in a key (S5). The order is the one the owner
// approved on `design/celebration-themes/01-baby-shower.html`.
export const BABY_SHOWER_THEMES = [
  "teddy-honey",
  "clouds-stars",
  "baby-safari",
  "hot-air-balloons",
  "boho-rainbow",
  "little-moon",
  "woodland-friends",
  "sweet-bunny",
] as const;

export type BabyShowerTheme = (typeof BABY_SHOWER_THEMES)[number];
