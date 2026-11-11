import { Plus } from "lucide-react";
import Link from "next/link";

import { adminButton } from "./admin-ui.ts";

/** The "Nuevo …" button at the top of a list page: a link to the create form, with a plus icon. */
export function NewRecordLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className={adminButton} href={href}>
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
