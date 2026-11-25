import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { INVITATION_PATHS } from "../../lib/customer/invitations.ts";
import { NAVIGATION_COPY } from "../../lib/customer/navigation-copy.ts";
import { quietButton } from "./ui.ts";

/**
 * The way back to the owner's invitations (T2; S2.3): one quiet pill with the arrow, the same words, and the same
 * place — the top-left of the page header — on the chooser, the editor, the payment pages, the full sample, and the
 * guest list, at every width. The owner could not find the old 20 px text link at the bottom of the chooser, so this
 * is a target of its own (`quietButton`: 44 px tall, the `field` border at 3:1, and the shared wine focus ring) and
 * it never depends on color alone, because the arrow and the words say what it does (S3).
 */
export function BackLink({ className = "" }: { className?: string }) {
  return (
    <Link
      aria-label={NAVIGATION_COPY.backToInvitationsLabel}
      className={`${quietButton} gap-2 ${className}`}
      href={INVITATION_PATHS.list}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {NAVIGATION_COPY.backToInvitations}
    </Link>
  );
}
