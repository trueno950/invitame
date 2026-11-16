// The elegant theme allow-list (S4): a theme is an allow-listed set of colors, licensed display fonts, and
// original fine-line ornaments that the «Arco y foto» layouts apply. The registry never resolves a theme from
// the database, so a `componentKey` and a theme both select reviewed code and nothing else. Names stay
// generic: no character, brand, or protected name appears in a key (S3). The order is the one the owner
// approved on `design/elegant-line/04-tablero-temas-elegantes.html`.
export const ELEGANT_THEMES = [
  "blush-gold",
  "ivory-black",
  "midnight-gold",
  "olive-cream",
  "champagne",
  "lavender-silver",
  "terracotta-sage",
  "burgundy-gold",
] as const;

export type ElegantTheme = (typeof ELEGANT_THEMES)[number];
