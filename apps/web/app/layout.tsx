import type { Metadata } from "next";
import { Cormorant_Garamond, Great_Vibes, Jost } from "next/font/google";
import type { ReactNode } from "react";

import { LANDING_COPY } from "../lib/landing/copy.ts";
import "./globals.css";

/*
 * Theme fonts (M2 T8t; S35), self-hosted by `next/font` at build time with only the weights the
 * pages use. Each sets a CSS variable on <html> that the `@theme inline` block of `globals.css`
 * turns into `font-display`, `font-script`, and `font-sans`. The landing's accented headings use the
 * display italic (T8l).
 */
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant-garamond",
});

const script = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-great-vibes",
});

const sans = Jost({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
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
