import Link from "next/link";

import { PUBLIC_INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import { quietButton } from "../../../_components/ui.ts";

/**
 * The short message a guest reads when there is no invitation to show (M5 T5; A3): a missing, draft,
 * archived, expired, or unrenderable invitation, and an API that cannot answer. The guest page has no
 * customer navigation, so the only way out is the home page.
 */
export function InvitationMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <main className="paper-wash relative isolate flex min-h-screen items-center justify-center px-4 py-10 text-ink sm:px-8">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-panel bg-surface/85 px-6 py-10 text-center shadow-soft ring-1 ring-gold/45 sm:px-10">
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] text-balance text-ink sm:text-[2.25rem]">
          {heading}
        </h1>
        <p className="max-w-md text-[0.9375rem] leading-relaxed text-pretty text-muted">{body}</p>
        <Link className={`${quietButton} mt-2`} href="/">
          {PUBLIC_INVITATION_COPY.home}
        </Link>
      </div>
    </main>
  );
}
