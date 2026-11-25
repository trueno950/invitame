import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY, PAYMENT_COPY } from "../../../../../lib/customer/copy.ts";
import { editorSectionTarget } from "../../../../../lib/customer/editor-sections.ts";
import {
  PAYMENT_PATHS,
  paymentReturnView,
  withoutProviderReturnParameters,
} from "../../../../../lib/customer/invitation-payment.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
} from "../../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../../_components/customer-workspace-shell.tsx";
import { quietButton } from "../../../../_components/ui.ts";
import { Notices } from "../../_components/notices.tsx";
import { PaymentReturnBody } from "../../_components/payment-panel.tsx";
import { invitations } from "../../_lib/api.ts";
import { attempt, resolveRead } from "../../_lib/load.ts";
import { startCheckoutAction } from "../../actions.ts";

export const metadata: Metadata = {
  title: PAYMENT_COPY.returnTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/cuenta/invitaciones/[id]/pago` (M7 T2, T3; S1, S4; T2: S2.3): where the provider sends the browser back after a
 * checkout, with whatever query it appends (`status`, `collection_status`, `payment_id`, …). Those parameters are
 * untrusted hints and are dropped before the page reads its own notice codes, so the page renders the API's own payment
 * state — never a query parameter, a cookie, or a client value — and a webhook the API received while the browser was
 * away decides what the owner sees. A package that needs no payment goes straight back to the invitation; a failed,
 * expired, or refunded payment offers the retry, which starts the checkout again. The shared «← Mis invitaciones» pill
 * opens the header in every state, the paid one included, so the way back to the list never depends on the outcome.
 */
export default async function InvitationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const notices = invitationPageNotices(withoutProviderReturnParameters(parameters));

  if (!isInvitationId(id)) {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={PAYMENT_COPY.returnEyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      >
        <Notices error={notices.error} notice={notices.notice} />
      </CustomerWorkspaceShell>
    );
  }

  const loaded = resolveRead(await attempt(() => invitations.payment(id)));

  if (loaded.status === "not-found") {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={PAYMENT_COPY.returnEyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      >
        <Notices error={notices.error} notice={notices.notice} />
      </CustomerWorkspaceShell>
    );
  }

  if (loaded.status === "unavailable") {
    return (
      <CustomerWorkspaceShell
        actions={
          <Link className={quietButton} href={PAYMENT_PATHS.returnPage(id)}>
            {PAYMENT_COPY.refresh}
          </Link>
        }
        back
        eyebrow={PAYMENT_COPY.returnEyebrow}
        heading={PAYMENT_COPY.unavailableHeading}
        intro={PAYMENT_COPY.unavailableBody}
      >
        <Notices error={notices.error} notice={notices.notice} />
      </CustomerWorkspaceShell>
    );
  }

  const view = paymentReturnView(loaded.value);

  return (
    <CustomerWorkspaceShell
      actions={
        // The paid page carries its own primary way back to the invitation, so the header does not repeat it.
        view.kind === "paid" ? undefined : (
          <Link
            className={quietButton}
            href={editorSectionTarget(INVITATION_PATHS.detail(id), "publicar")}
          >
            {PAYMENT_COPY.backToInvitation}
          </Link>
        )
      }
      back
      eyebrow={PAYMENT_COPY.returnEyebrow}
      heading={view.heading}
      intro={view.body}
    >
      <div className="flex max-w-2xl flex-col gap-4">
        <Notices error={notices.error} notice={notices.notice} />
        <PaymentReturnBody action={startCheckoutAction} invitationId={id} view={view} />
      </div>
    </CustomerWorkspaceShell>
  );
}
