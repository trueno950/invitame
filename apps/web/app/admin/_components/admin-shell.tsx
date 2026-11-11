import {
  ChevronRight,
  LayoutDashboard,
  LayoutTemplate,
  LibraryBig,
  LogOut,
  type LucideIcon,
  Package,
  Sparkles,
  Tags,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CATALOG_INDEX_COPY, CATALOG_PATHS } from "../../../lib/admin/catalog/copy.ts";
import { ADMIN_PANEL_COPY, ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { SignOutButton } from "../../_components/sign-out-button.tsx";
import { AdminBrandMark } from "./admin-brand-mark.tsx";
import { adminButtonOutline, adminButtonSmall, adminFocus } from "./admin-ui.ts";

/** The sidebar entry of the page, highlighted and marked as the current page. */
export type AdminSection =
  | "panel"
  | "catalog"
  | "categories"
  | "features"
  | "packages"
  | "templates";

export interface Breadcrumb {
  label: string;
  /** Absent on the last crumb, the current page. */
  href?: string;
}

interface AdminShellProperties {
  current?: AdminSection | undefined;
  heading: string;
  description?: string | undefined;
  /** Buttons on the right of the heading, such as "Nuevo paquete". */
  actions?: ReactNode;
  breadcrumbs?: readonly Breadcrumb[];
  /**
   * `wide` (the default) uses the whole content area for tables and dashboards; `form` centers the
   * header and the content in one reading-width column, for pages that hold a single form.
   */
  width?: "wide" | "form";
  children: ReactNode;
}

/** The sidebar entry of each catalog area, keyed by the area's path. */
const SECTION_BY_PATH: Readonly<Record<string, AdminSection>> = {
  [CATALOG_PATHS.categories]: "categories",
  [CATALOG_PATHS.features]: "features",
  [CATALOG_PATHS.packages]: "packages",
  [CATALOG_PATHS.templates]: "templates",
};

/** The icon of each catalog area in the sidebar, keyed by the area's path. */
const ICON_BY_PATH: Readonly<Record<string, LucideIcon>> = {
  [CATALOG_PATHS.categories]: Tags,
  [CATALOG_PATHS.features]: Sparkles,
  [CATALOG_PATHS.packages]: Package,
  [CATALOG_PATHS.templates]: LayoutTemplate,
};

const MAIN_WIDTH = {
  wide: "max-w-7xl",
  form: "max-w-3xl",
} as const;

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon | undefined;
  active: boolean;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors ${
        active
          ? "bg-admin-subtle font-medium text-admin-ink"
          : "text-admin-ink hover:bg-admin-subtle"
      } ${adminFocus}`}
      href={href}
    >
      {Icon === undefined ? null : (
        <Icon
          aria-hidden="true"
          className={`size-4 shrink-0 ${active ? "text-admin-ink" : "text-admin-muted"}`}
        />
      )}
      {label}
    </Link>
  );
}

/**
 * A group title of the sidebar. It is a label, not a link: small capitals in the muted color, with no
 * hover or pointer, so it never reads as an entry one can open.
 */
const groupLabel =
  "hidden cursor-default px-2.5 pt-5 pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-admin-muted uppercase select-none lg:block first:lg:pt-0";

/**
 * The frame of the administration pages: a sidebar with the navigation and the sign-out button (a
 * top bar on small screens), a sticky breadcrumb bar, and a compact page header with its actions.
 * The pages stay server components; the sidebar is plain links, so it works without JavaScript. The
 * navigation is never a guard: each page and the API authorize on their own.
 */
export function AdminShell({
  current,
  heading,
  description,
  actions,
  breadcrumbs = [],
  width = "wide",
  children,
}: AdminShellProperties) {
  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3 border-b border-admin-border bg-admin-surface px-3 py-3 lg:sticky lg:top-0 lg:h-screen lg:gap-6 lg:border-r lg:border-b-0 lg:py-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            className={`flex items-center gap-2.5 rounded-md px-1.5 py-1 ${adminFocus}`}
            href="/admin"
          >
            <AdminBrandMark />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-admin-ink">
                {ADMIN_SHELL_COPY.brand}
              </span>
              <span className="block text-xs text-admin-muted">{ADMIN_SHELL_COPY.area}</span>
            </span>
          </Link>
        </div>
        <nav aria-label={ADMIN_SHELL_COPY.navigationLabel} className="min-w-0 lg:flex-1">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            <li className={groupLabel}>{ADMIN_SHELL_COPY.generalGroup}</li>
            <li>
              <NavLink
                active={current === "panel"}
                href="/admin"
                icon={LayoutDashboard}
                label={ADMIN_SHELL_COPY.panel}
              />
            </li>
            <li className={groupLabel}>{ADMIN_SHELL_COPY.catalogGroup}</li>
            <li>
              <NavLink
                active={current === "catalog"}
                href={CATALOG_PATHS.index}
                icon={LibraryBig}
                label={ADMIN_SHELL_COPY.catalogOverview}
              />
            </li>
            {CATALOG_INDEX_COPY.sections.map((entry) => (
              <li key={entry.path}>
                <NavLink
                  active={current !== undefined && current === SECTION_BY_PATH[entry.path]}
                  href={entry.path}
                  icon={ICON_BY_PATH[entry.path]}
                  label={entry.title}
                />
              </li>
            ))}
          </ul>
        </nav>
        <div className="lg:border-t lg:border-admin-border lg:pt-4">
          <SignOutButton
            className={`${adminButtonOutline} ${adminButtonSmall} w-full`}
            failedMessage={ADMIN_PANEL_COPY.signOutFailed}
            icon={<LogOut aria-hidden="true" className="size-3.5" />}
            label={ADMIN_PANEL_COPY.signOut}
            pendingLabel={ADMIN_PANEL_COPY.signingOut}
            signInPath="/admin/ingresar"
          />
        </div>
      </aside>

      <div className="min-w-0">
        {breadcrumbs.length === 0 ? null : (
          <nav
            aria-label={ADMIN_SHELL_COPY.breadcrumbLabel}
            className="sticky top-0 z-10 flex h-12 items-center border-b border-admin-border bg-admin-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8"
          >
            <ol className="flex min-w-0 items-center gap-1.5 text-sm text-admin-muted">
              {breadcrumbs.map((crumb, index) => (
                <li className="flex min-w-0 items-center gap-1.5" key={crumb.href ?? crumb.label}>
                  {index === 0 ? null : (
                    <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
                  )}
                  {crumb.href === undefined ? (
                    <span aria-current="page" className="truncate font-medium text-admin-ink">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      className={`truncate rounded-sm hover:text-admin-ink ${adminFocus}`}
                      href={crumb.href}
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <main className={`mx-auto w-full ${MAIN_WIDTH[width]} px-4 py-6 sm:px-6 lg:px-8`}>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-admin-ink">{heading}</h1>
              {description === undefined ? null : (
                <p className="mt-1 text-sm text-admin-muted">{description}</p>
              )}
            </div>
            {actions === undefined ? null : (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            )}
          </div>
          <div className="flex flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
