import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The administrator pages (M2 T8d; S36): `/admin`, `/admin/ingresar`, `/admin/activar`, and the
 * catalog. No public page links here, and search engines are asked not to index them. They stay out
 * of the `proxy.ts` matcher: administrator sessions are never extended (L34), and their session read
 * never refreshes a customer's session (`lib/server/auth-session.ts`).
 *
 * The `admin-theme` scope (`app/globals.css`) gives the whole area its neutral administration look,
 * including the sign-in, enrollment, and sign-out components shared with the customer pages.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-theme">{children}</div>;
}
