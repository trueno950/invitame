import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY } from "../../../../../../lib/customer/copy.ts";
import { INVITATION_PATHS } from "../../../../../../lib/customer/invitations.ts";
import { findPreviewTarget } from "../../../../../../lib/customer/template-preview.ts";
import { themeStepPath } from "../../../../../../lib/customer/template-steps.ts";
import { findRenderer } from "../../../../../../lib/renderers/registry.ts";
import { requestOrigin } from "../../../../../../lib/server/request-origin.ts";
import { CustomerWorkspaceShell } from "../../../../../_components/customer-workspace-shell.tsx";
import { quietButton, textButton } from "../../../../../_components/ui.ts";
import { invitations } from "../../../_lib/api.ts";
import { attempt, resolveRead } from "../../../_lib/load.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.previewPageTitle,
  // A signed-in preview of a sample: nothing to index and nothing to share.
  robots: { index: false, follow: false },
};

/** The width of the phone the sample is rendered at: the same 390 px the layouts are designed for. */
const PHONE_WIDTH = "24.375rem";

/** The notice of a page that has no sample to show, with the way back to the chooser. */
function PlainShell({ heading, body }: { heading: string; body: string }) {
  return (
    <CustomerWorkspaceShell eyebrow={INVITATION_COPY.previewEyebrow} heading={heading} intro={body}>
      <Link className={quietButton} href={INVITATION_PATHS.create}>
        {INVITATION_COPY.previewBack}
      </Link>
    </CustomerWorkspaceShell>
  );
}

/**
 * `/cuenta/invitaciones/nueva/vista/[versionId]` (T9, T10b; S9, S10): «Ver completa» from the theme step of
 * the chooser. The page shows the sample invitation of one published version at phone width, rendered by the
 * same allow-listed renderer the guest page uses, with the configuration the version stores — never a
 * screenshot. It sits under
 * `/cuenta`, so it needs a session like the rest of the account: a signed-out visitor is sent to sign in by
 * the shared read step. An id the creator catalog does not publish, a template id instead of a version id,
 * and a snapshot the renderer refuses all answer the same friendly notice, and the page leads back to
 * choosing that template, which is the theme step with this theme still selected.
 */
export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  await connection();
  const [{ versionId }, origin] = await Promise.all([params, headers().then(requestOrigin)]);
  const loaded = resolveRead(await attempt(() => invitations.templates()));

  if (loaded.status === "unavailable") {
    return (
      <PlainShell
        body={INVITATION_COPY.unavailableBody}
        heading={INVITATION_COPY.previewUnavailableHeading}
      />
    );
  }

  const target =
    loaded.status === "ok" && origin !== undefined
      ? findPreviewTarget(loaded.value, versionId, origin)
      : undefined;
  const Renderer =
    target === undefined ? undefined : findRenderer(target.template.publishedVersion.componentKey);

  if (target === undefined || Renderer === undefined) {
    return (
      <PlainShell
        body={INVITATION_COPY.previewNotFoundBody}
        heading={INVITATION_COPY.previewNotFoundHeading}
      />
    );
  }

  // The way back keeps the choice: the theme step, with this published version selected.
  const chooser = themeStepPath(versionId);

  return (
    <main className="paper-wash relative isolate min-h-screen px-4 py-5 text-ink sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: PHONE_WIDTH }}>
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-panel bg-surface/90 px-4 py-2.5 ring-1 ring-gold/45">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {INVITATION_COPY.sampleNote}
            </p>
            <p className="truncate font-medium text-ink">{target.template.name}</p>
          </div>
          <Link className={textButton} href={chooser}>
            {INVITATION_COPY.previewChoose}
          </Link>
        </header>

        <h1 className="sr-only">{INVITATION_COPY.previewHeading(target.template.name)}</h1>
        <p className="text-center text-sm leading-6 text-pretty text-muted">
          {INVITATION_COPY.previewIntro}
        </p>

        <Renderer configuration={target.sample.configuration} content={target.sample.content} />

        <div className="flex justify-center pb-4">
          <Link className={textButton} href={chooser}>
            {INVITATION_COPY.previewBack}
          </Link>
        </div>
      </div>
    </main>
  );
}
