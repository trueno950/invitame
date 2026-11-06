import type { Metadata } from "next";
import { Cormorant_Garamond, Great_Vibes, Jost } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

/*
 * Theme fonts (M2 T8t; S35), self-hosted by `next/font` at build time with only the weights the
 * pages use. Each sets a CSS variable on <html> that the `@theme inline` block of `globals.css`
 * turns into `font-display`, `font-script`, and `font-sans`.
 */
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
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

export const metadata: Metadata = {
  title: "InvitaMe | Fundación inicial",
  description: "La base inicial de InvitaMe para futuras invitaciones memorables.",
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
