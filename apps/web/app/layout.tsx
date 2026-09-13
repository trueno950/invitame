import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "InvitaMe | Fundación inicial",
  description: "La base inicial de InvitaMe para futuras invitaciones memorables.",
};

interface RootLayoutProperties {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProperties) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
