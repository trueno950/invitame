import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { adminSelect } from "./admin-ui.ts";

/**
 * The administration's `<select>`: the native control with its own chevron, inset from the right
 * border like the text of the field. It takes every `<select>` prop, so it works both uncontrolled in
 * server-rendered forms and controlled in client components.
 */
export function AdminSelect({ className, ...properties }: ComponentProps<"select">) {
  return (
    <div className="relative mt-1.5">
      <select
        className={className === undefined ? adminSelect : `${adminSelect} ${className}`}
        {...properties}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-admin-muted"
      />
    </div>
  );
}
