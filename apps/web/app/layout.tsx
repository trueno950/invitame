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
    <html className={`${display.variable} ${script.variable} ${sans.variable}`} lang="es">
      <body>{children}</body>
    </html>
  );
}
