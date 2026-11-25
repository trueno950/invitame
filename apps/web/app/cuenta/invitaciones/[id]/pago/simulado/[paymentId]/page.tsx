import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY, PAYMENT_COPY } from "../../../../../../../lib/customer/copy.ts";
import { simulatedPaymentView } from "../../../../../../../lib/customer/invitation-payment.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
} from "../../../../../../../lib/customer/invitations.ts";
import {
  type InvitationPayment,
  isInvitationId,
} from "../../../../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../../../../_components/customer-workspace-shell.tsx";
import { quietButton } from "../../../../../../_components/ui.ts";
import { Notices } from "../../../../_components/notices.tsx";
import { SimulatedPaymentBody } from "../../../../_components/payment-panel.tsx";
import { invitations } from "../../../../_lib/api.ts";
import { attempt, type Loaded, resolveRead } from "../../../../_lib/load.ts";
import { emitSimulatedPaymentAction } from "../../../../actions.ts";

export const metadata: Metadata = {
  title: PAYMENT_COPY.simulatedTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/cuenta/invitaciones/[id]/pago/simulado/[paymentId]` (M7 T2; S4): the development-only page the simulated
 * provider's checkout redirects to. It lives under `/cuenta`, so the session proxy covers it and the page knows which
 * invitation to return to; the emit route answers only the outcome. «Pagar» and «Simular rechazo» post the same server
 * action with a different outcome, and the API signs an event and sends it through the intake a real provider would
 * use. A payment that cannot be read, is already paid, or belongs to a deployment that sells nothing shows the one
 * note that this test payment is not available. The shared «← Mis invitaciones» pill opens the header, and the way back
 * to the invitation stays beside it (T2; S2.3).
 */
export default async function SimulatedPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; paymentId: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id, paymentId }, parameters] = await Promise.all([params, searchParams]);
  const notices = invitationPageNotices(parameters);
  const usable = isInvitationId(id) && isInvitationId(paymentId);
  const loaded: Loaded<InvitationPayment> | undefined = usable
    ? resolveRead(await attempt(() => invitations.payment(id)))
    : undefined;
  const view = simulatedPaymentView(loaded?.status === "ok" ? loaded.value : undefined);
  const heading =
    loaded?.status === "unavailable" ? INVITATION_COPY.unavailableHeading : view.heading;
  // The page's own line says what the state is: the simulated note while the buttons are offered, the reason when
  // they are not, and the outage when the read itself failed.
  const intro =
    loaded?.status === "unavailable"
      ? INVITATION_COPY.unavailableBody
      : view.kind === "available"
        ? view.note
        : view.body;

  return (
    <CustomerWorkspaceShell
      actions={
        isInvitationId(id) ? (
          <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
            {PAYMENT_COPY.backToInvitation}
          </Link>
        ) : undefined
      }
      back
      eyebrow={PAYMENT_COPY.simulatedEyebrow}
      heading={heading}
      intro={intro}
    >
      <div className="flex max-w-2xl flex-col gap-4">
        <Notices error={notices.error} notice={notices.notice} />
        <SimulatedPaymentBody
          action={emitSimulatedPaymentAction}
          invitationId={id}
          paymentId={paymentId}
          view={view}
        />
      </div>
    </CustomerWorkspaceShell>
  );
}
