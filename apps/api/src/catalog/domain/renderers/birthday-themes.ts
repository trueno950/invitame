// The shared birthday theme allow-list (S7, S8): a theme is an allow-listed set of palette, licensed fonts,
// and original illustrations that a birthday layout applies. The registry never resolves a theme from the
// database, so a `componentKey` and a theme both select reviewed code and nothing else. Names stay generic:
// no character, brand, or protected name appears in a key (S5).
export const BIRTHDAY_THEMES = [
  "ice-kingdom",
  "rescue-team",
  "spider-hero",
  "classic-mouse",
  "dinosaurs",
  "under-the-sea",
  "fairytale-princess",
  "blocks-and-pixels",
] as const;

export type BirthdayTheme = (typeof BIRTHDAY_THEMES)[number];
