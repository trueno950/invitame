import Link from "next/link";
import type { ReactNode } from "react";

import { PUBLIC_INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import { findRenderer } from "../../../../lib/renderers/registry.ts";
import { textButton } from "../../../_components/ui.ts";

/**
 * The invitation a guest reads, exactly as `/i/<slug>` renders it (M5 T5; T2b). One server component for both pages
 * that show an invitation: the guest page, with the answer's notice above it, and the owner's preview of a stored
 * draft, which appends nothing of its own (S3, S4). The `componentKey` becomes a component only through the renderer
 * registry, a key this deployment does not render draws nothing (each page already decided what to show instead), and
 * the footer is the one link the invitation carries.
 *
 * There is no client component here and nothing to submit: the layout and its features block are rendered by the
 * server, exactly as they are on the guest page.
 */

export interface GuestInvitationProps {
  readonly componentKey: string;
  readonly configuration: unknown;
  readonly content: unknown;
  /** The content fields the omitted sections cover (S8.3); absent means the version omits nothing. */
  readonly hiddenFields?: readonly string[];
  /** The features block's props; absent when the invitation has nothing beyond its own content (F3; S4). */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; the owner's preview passes none, because it serves no draft. */
  readonly calendarHref?: string;
  /** The answer's notice, drawn above the invitation; the owner's preview has none (G3; S4). */
  readonly notice?: ReactNode;
}

export function GuestInvitation({
  componentKey,
  configuration,
  content,
  hiddenFields,
  features,
  calendarHref,
  notice,
}: GuestInvitationProps) {
  const Renderer = findRenderer(componentKey);

  if (Renderer === undefined) {
    return null;
  }

  // Only what the page has: a page with no features passes the two props it always passed (F3; S4).
  const props = {
    configuration,
    content,
    ...(hiddenFields === undefined ? {} : { hiddenFields }),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  };

  return (
    <main className="paper-wash relative isolate min-h-screen px-4 py-6 text-ink sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {notice ?? null}
        <Renderer {...props} />
        <footer className="flex justify-center">
          <Link className={textButton} href="/">
            {PUBLIC_INVITATION_COPY.madeWith}
          </Link>
        </footer>
      </div>
    </main>
  );
}
