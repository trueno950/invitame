import type { ReactNode } from "react";

/**
 * The two-column frame of a record's detail page on large screens: the main cards in two thirds of the
 * width and the side cards (the price, the versions) in the remaining third. One column below `lg`.
 * A `stickyAside` stays in view under the breadcrumb bar while the main column scrolls.
 */
export function AdminDetailLayout({
  main,
  aside,
  stickyAside = false,
}: {
  main: ReactNode;
  aside: ReactNode;
  stickyAside?: boolean;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">{main}</div>
      <div className={`flex min-w-0 flex-col gap-6 ${stickyAside ? "lg:sticky lg:top-16" : ""}`}>
        {aside}
      </div>
    </div>
  );
}
