import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
  packageOptions,
  templateOptions,
} from "../../../../lib/customer/invitations.ts";
import { CustomerShell } from "../../../_components/customer-shell.tsx";
import {
  errorNote,
  fieldLabel,
  primaryButton,
  quietButton,
  textButton,
  textField,
} from "../../../_components/ui.ts";
import { Notices } from "../_components/notices.tsx";
import { createInvitationAction } from "../actions.ts";
import { invitations } from "../_lib/api.ts";
import { attempt, resolveRead } from "../_lib/load.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.createPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/cuenta/invitaciones/nueva` (M4 T5; S6, S8): chooses a published template and an active package. The
 * form posts to a server action, so it works without JavaScript; the API is the authority on whether the
 * package fits the pinned version. Creating and editing the draft is free (S6).
 */
export default async function NewInvitationPage({
  searchParams,
}: {
  searchParams: SearchParameters;
}) {
  await connection();
  const notices = invitationPageNotices(await searchParams);
  const [templates, packages] = await Promise.all([
    attempt(() => invitations.templates()),
    attempt(() => invitations.packages()),
  ]);
  const loadedTemplates = resolveRead(templates);
  const loadedPackages = resolveRead(packages);
  const available = loadedTemplates.status === "ok" && loadedPackages.status === "ok";
  const templateChoices =
    loadedTemplates.status === "ok" ? templateOptions(loadedTemplates.value) : [];
  const packageChoices = loadedPackages.status === "ok" ? packageOptions(loadedPackages.value) : [];
  const canCreate = templateChoices.length > 0 && packageChoices.length > 0;

  return (
    <CustomerShell
      eyebrow={INVITATION_COPY.createEyebrow}
      heading={available ? INVITATION_COPY.createHeading : INVITATION_COPY.unavailableHeading}
      intro={available ? INVITATION_COPY.createIntro : INVITATION_COPY.unavailableBody}
    >
      <div className="flex flex-col gap-6">
        <Notices notice={notices.notice} error={notices.error} />

        {available && canCreate ? (
          <form action={createInvitationAction} className="flex flex-col gap-5">
            <div>
              <label className={fieldLabel} htmlFor="templateVersionId">
                {INVITATION_COPY.templateLabel}
              </label>
              <select
                className={textField}
                defaultValue={templateChoices[0]?.value}
                id="templateVersionId"
                name="templateVersionId"
              >
                {templateChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={fieldLabel} htmlFor="packageId">
                {INVITATION_COPY.packageLabel}
              </label>
              <select
                className={textField}
                defaultValue={packageChoices[0]?.value}
                id="packageId"
                name="packageId"
              >
                {packageChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            <button className={primaryButton} type="submit">
              {INVITATION_COPY.createSubmit}
            </button>
          </form>
        ) : null}

        {available && templateChoices.length === 0 ? (
          <p className="text-center leading-7 text-pretty text-muted">
            {INVITATION_COPY.noTemplates}
          </p>
        ) : null}

        {available && templateChoices.length > 0 && packageChoices.length === 0 ? (
          <p className="text-center leading-7 text-pretty text-muted">
            {INVITATION_COPY.noPackages}
          </p>
        ) : null}

        {available ? null : (
          <div className="flex flex-col items-center gap-4">
            <p className={errorNote}>{INVITATION_COPY.unavailableBody}</p>
            <a className={quietButton} href={INVITATION_PATHS.create}>
              {INVITATION_COPY.retry}
            </a>
          </div>
        )}

        <div className="border-t border-gold/40 pt-6 text-center">
          <Link className={textButton} href={INVITATION_PATHS.list}>
            {INVITATION_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
