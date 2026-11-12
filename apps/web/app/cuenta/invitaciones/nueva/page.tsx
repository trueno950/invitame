import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
  packageChoices,
} from "../../../../lib/customer/invitations.ts";
import {
  checkedVersionId,
  TEMPLATE_FIELD_NAME,
  templateChoiceCards,
} from "../../../../lib/customer/template-preview.ts";
import { requestOrigin } from "../../../../lib/server/request-origin.ts";
import { CustomerWorkspaceShell } from "../../../_components/customer-workspace-shell.tsx";
import { errorNote, primaryButton, quietButton, textButton } from "../../../_components/ui.ts";
import { Notices } from "../_components/notices.tsx";
import { OptionCard } from "../_components/option-card.tsx";
import { LayoutChoiceCard, TemplateChoiceCard } from "../_components/template-choice-card.tsx";
import { invitations } from "../_lib/api.ts";
import { attempt, resolveRead } from "../_lib/load.ts";
import { createInvitationAction } from "../actions.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.createPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The first value of one query parameter, or nothing; a repeated parameter names no version. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * `/cuenta/invitaciones/nueva` (M4 T5, T8; T9; S6, S8, S9, S11): chooses a published template and an
 * active package as two radio groups of cards, so the whole choice is visible at once instead of hidden in
 * two selects. The templates are shown as one card per themed layout — with a live miniature of the real
 * renderer for each theme and a switch per published version — plus a card of its own for every template
 * without themes; «Ver completa» opens the sample at phone width. Each card is a native radio inside its
 * label or chip, so the page needs no script and stays usable from the keyboard, and the value the form
 * submits is still the published version id. The price of the package is on its card. The API is the
 * authority on whether the package fits the pinned version. Creating and editing the draft is free (S6).
 */
export default async function NewInvitationPage({
  searchParams,
}: {
  searchParams: SearchParameters;
}) {
  await connection();
  const parameters = await searchParams;
  const notices = invitationPageNotices(parameters);
  const origin = requestOrigin(await headers());
  const [templates, packages] = await Promise.all([
    attempt(() => invitations.templates()),
    attempt(() => invitations.packages()),
  ]);
  const loadedTemplates = resolveRead(templates);
  const loadedPackages = resolveRead(packages);
  const available = loadedTemplates.status === "ok" && loadedPackages.status === "ok";
  // A page with no trustworthy origin still offers every template; only the miniatures need one, so they
  // are dropped instead of the choice (`samples.ts` builds the sample photo from the origin).
  const templateCards =
    loadedTemplates.status === "ok" ? templateChoiceCards(loadedTemplates.value, origin ?? "") : [];
  const packageCards = loadedPackages.status === "ok" ? packageChoices(loadedPackages.value) : [];
  const checked = checkedVersionId(templateCards, firstValue(parameters[TEMPLATE_FIELD_NAME]));
  const canCreate = templateCards.length > 0 && packageCards.length > 0;

  return (
    <CustomerWorkspaceShell
      eyebrow={INVITATION_COPY.createEyebrow}
      heading={available ? INVITATION_COPY.createHeading : INVITATION_COPY.unavailableHeading}
      intro={available ? INVITATION_COPY.createIntro : INVITATION_COPY.unavailableBody}
    >
      <div className="flex flex-col gap-5">
        <Notices error={notices.error} notice={notices.notice} />

        {available && canCreate ? (
          <form action={createInvitationAction} className="flex flex-col gap-5">
            <fieldset className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
              <legend className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {INVITATION_COPY.templateLabel}
              </legend>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {templateCards.map((card) =>
                  card.kind === "layout" ? (
                    <LayoutChoiceCard card={card} key={card.groupId} selectedVersionId={checked} />
                  ) : (
                    <TemplateChoiceCard
                      card={card}
                      checked={card.versionId === checked}
                      key={card.versionId}
                    />
                  ),
                )}
              </div>
            </fieldset>

            <fieldset className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
              <legend className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {INVITATION_COPY.packageLabel}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {packageCards.map((card, index) => (
                  <OptionCard
                    defaultChecked={index === 0}
                    description={card.description}
                    key={card.value}
                    meta={card.meta}
                    name="packageId"
                    title={card.name}
                    value={card.value}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end">
              <button className={`${primaryButton} sm:w-auto sm:px-10`} type="submit">
                {INVITATION_COPY.createSubmit}
              </button>
            </div>
          </form>
        ) : null}

        {available && templateCards.length === 0 ? (
          <p className="leading-7 text-pretty text-muted">{INVITATION_COPY.noTemplates}</p>
        ) : null}

        {available && templateCards.length > 0 && packageCards.length === 0 ? (
          <p className="leading-7 text-pretty text-muted">{INVITATION_COPY.noPackages}</p>
        ) : null}

        {available ? null : (
          <div className="flex flex-col items-start gap-4">
            <p className={errorNote}>{INVITATION_COPY.unavailableBody}</p>
            <a className={quietButton} href={INVITATION_PATHS.create}>
              {INVITATION_COPY.retry}
            </a>
          </div>
        )}

        <div className="border-t border-gold/40 pt-4">
          <Link className={textButton} href={INVITATION_PATHS.list}>
            {INVITATION_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerWorkspaceShell>
  );
}
