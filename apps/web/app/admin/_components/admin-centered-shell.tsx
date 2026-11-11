import type { ReactNode } from "react";

import { ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { AdminBrandMark } from "./admin-brand-mark.tsx";

interface AdminCenteredShellProperties {
  heading: string;
  intro: string;
  children: ReactNode;
}

/**
 * The frame of the administration pages shown before the panel, or when it cannot load: sign-in,
 * enrollment, and the unavailable notices. One neutral card centered on the page, with the brand
 * above it; no navigation, because the visitor is not (yet) a confirmed administrator.
 */
export function AdminCenteredShell({ heading, intro, children }: AdminCenteredShellProperties) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <AdminBrandMark />
        <span className="text-sm font-semibold text-admin-ink">
          {ADMIN_SHELL_COPY.brand}{" "}
          <span className="font-normal text-admin-muted">· {ADMIN_SHELL_COPY.area}</span>
        </span>
      </div>
      <div className="w-full max-w-md rounded-xl border border-admin-border bg-admin-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-admin-ink">{heading}</h1>
        <p className="mt-1.5 text-sm leading-6 text-admin-muted">{intro}</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
