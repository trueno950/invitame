import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { LANDING_COPY } from "../lib/landing/copy.ts";
import "./globals.css";

/*
 * Theme fonts (M2 T8t; S35), served from the committed Latin-subset woff2 files in `./fonts/` (T8f;
 * S43), so the build fetches no font over the network. The Cormorant Garamond and Jost files are
 * variable fonts, so one file per style covers the weight range the pages use. Each sets a CSS
 * variable on <html> that the `@theme inline` block of `globals.css` turns into `font-display`,
 * `font-script`, and `font-sans`. The landing's accented headings use the display italic (T8l).
 * The fallback faces keep the fonts `next/font/google` paired them with: Times New Roman for the
 * serif display font, Arial for the others.
 */
const display = localFont({
  src: [
    {
      path: "./fonts/cormorant-garamond/cormorant-garamond-latin-normal.woff2",
      weight: "500 600",
      style: "normal",
    },
    {
      path: "./fonts/cormorant-garamond/cormorant-garamond-latin-italic.woff2",
      weight: "500 600",
      style: "italic",
    },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  variable: "--font-cormorant-garamond",
});

const script = localFont({
  src: [
    { path: "./fonts/great-vibes/great-vibes-latin-normal.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-great-vibes",
});

const sans = localFont({
  src: [{ path: "./fonts/jost/jost-latin-normal.woff2", weight: "400 500", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-jost",
});

/*
 * Guest invitation display fonts (T6b; S2, S5, S8): the licensed title face of each children's birthday theme,
 * committed as Latin woff2 files under `./fonts/<family>/` next to the license google/fonts ships for it. Each
 * file is drawn at its single shipped weight and used for names and titles only, so body text stays Jost
 * 400/500 (S8). They are never preloaded: a guest page uses at most one of them, and the fonts test fails if a
 * declaration stops disabling preload. The fallback faces are the theme board's.
 */
const cinzelDecorative = localFont({
  src: [
    {
      path: "./fonts/cinzel-decorative/cinzel-decorative-latin-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  preload: false,
  variable: "--font-cinzel-decorative",
});

const luckiestGuy = localFont({
  src: [
    {
      path: "./fonts/luckiest-guy/luckiest-guy-latin-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-luckiest-guy",
});

const bangers = localFont({
  src: [{ path: "./fonts/bangers/bangers-latin-normal.woff2", weight: "400", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-bangers",
});

const chewy = localFont({
  src: [{ path: "./fonts/chewy/chewy-latin-normal.woff2", weight: "400", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-chewy",
});

const lilitaOne = localFont({
  src: [
    { path: "./fonts/lilita-one/lilita-one-latin-normal.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-lilita-one",
});

const pacifico = localFont({
  src: [{ path: "./fonts/pacifico/pacifico-latin-normal.woff2", weight: "400", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-pacifico",
});

const pressStart2P = localFont({
  src: [
    {
      path: "./fonts/press-start-2p/press-start-2p-latin-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-press-start-2p",
});

/*
 * Baby shower and themed baptism display fonts (T7b; S13): the nine title faces of
 * `design/celebration-themes/`, each a Latin woff2 file at one weight suited to display titles and each
 * with the license google/fonts ships for it. Same rules as the birthday faces above: names and titles
 * only, and never preloaded, because a guest page renders one theme.
 */
const baloo2 = localFont({
  src: [{ path: "./fonts/baloo-2/baloo-2-latin-normal.woff2", weight: "700", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-baloo-2",
});

const quicksand = localFont({
  src: [{ path: "./fonts/quicksand/quicksand-latin-normal.woff2", weight: "600", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-quicksand",
});

const fredoka = localFont({
  src: [{ path: "./fonts/fredoka/fredoka-latin-normal.woff2", weight: "600", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-fredoka",
});

const playfairDisplay = localFont({
  src: [
    {
      path: "./fonts/playfair-display/playfair-display-latin-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  preload: false,
  variable: "--font-playfair-display",
});

const josefinSans = localFont({
  src: [
    {
      path: "./fonts/josefin-sans/josefin-sans-latin-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-josefin-sans",
});

const fraunces = localFont({
  src: [{ path: "./fonts/fraunces/fraunces-latin-normal.woff2", weight: "700", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  preload: false,
  variable: "--font-fraunces",
});

const caveat = localFont({
  src: [{ path: "./fonts/caveat/caveat-latin-normal.woff2", weight: "700", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-caveat",
});

const nunito = localFont({
  src: [{ path: "./fonts/nunito/nunito-latin-normal.woff2", weight: "700", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  preload: false,
  variable: "--font-nunito",
});

const lora = localFont({
  src: [{ path: "./fonts/lora/lora-latin-normal.woff2", weight: "700", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  preload: false,
  variable: "--font-lora",
});

const themeFontVariables = [
  cinzelDecorative.variable,
  luckiestGuy.variable,
  bangers.variable,
  chewy.variable,
  lilitaOne.variable,
  pacifico.variable,
  pressStart2P.variable,
  baloo2.variable,
  quicksand.variable,
  fredoka.variable,
  playfairDisplay.variable,
  josefinSans.variable,
  fraunces.variable,
  caveat.variable,
  nunito.variable,
  lora.variable,
].join(" ");

/** Defaults for every page; the landing's honest pre-launch title and description (T8l; S37). */
export const metadata: Metadata = {
  title: LANDING_COPY.metadata.title,
  description: LANDING_COPY.metadata.description,
};

interface RootLayoutProperties {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProperties) {
  return (
    <html
      className={`${display.variable} ${script.variable} ${sans.variable} ${themeFontVariables}`}
      lang="es"
    >
      <body>{children}</body>
    </html>
  );
}
