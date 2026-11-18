import { PAYMENT_COPY } from "../../../../lib/customer/copy.ts";
import {
  PAYMENT_PATHS,
  type PaymentPanelView,
  type PaymentReturnView,
  type SimulatedPaymentView,
} from "../../../../lib/customer/invitation-payment.ts";
import { INVITATION_PATHS } from "../../../../lib/customer/invitations.ts";
import { primaryButton, quietButton, statusNote, textButton } from "../../../_components/ui.ts";
import { GuardedForm } from "./autosave/navigation-guard.tsx";

/**
 * The payment blocks of a creator's invitation (M7 T2; S1, S4). Every state is the API's answer: the panel shows
 * «Pagar y publicar» with the amount while the gate asks for a payment, the date once it is paid, and a retry after a
 * failed one. The forms post to server actions, so they work without JavaScript like the rest of the draft page, and
 * the publish button of a draft is only a hint — the API's payment gate is what actually refuses publication (S1).
 */

/**
 * The «Pagar y publicar» panel of a draft's side column (S4). It renders nothing in a deployment that sells nothing,
 * so a free draft looks exactly as it did before Milestone 7.
 */
export function PaymentPanel({
  action,
  invitationId,
  view,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  view: PaymentPanelView;
}) {
  if (view.kind === "hidden") {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {view.heading}
      </h2>
      {view.kind === "amount-unavailable" ? (
        <p className={statusNote}>{view.note}</p>
      ) : (
        <>
          {view.amount === "" ? null : (
            <p className="font-medium text-ink">{PAYMENT_COPY.total(view.amount)}</p>
          )}
          {view.kind === "paid" ? (
            <>
              {view.paidOn === "" ? null : (
                <p className="text-sm leading-6 text-muted">{view.paidOn}</p>
              )}
              <p className={statusNote}>{view.hint}</p>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted">{view.hint}</p>
              <GuardedForm action={action} section="publicar">
                <input name="id" type="hidden" value={invitationId} />
                <button className={primaryButton} type="submit">
                  {view.action}
                </button>
              </GuardedForm>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The return page's own content (S4). The provider sends the browser here after the checkout, and the state comes from
 * `GET /invitations/:id/payment`, never from the query: a reload after the provider's webhook shows the new state.
 */
export function PaymentReturnBody({
  action,
  invitationId,
  view,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  view: PaymentReturnView;
}) {
  if (view.kind === "pending") {
    return (
      <>
        <p className={statusNote}>{view.body}</p>
        {/* A plain link reloads the document, so the state is read from the API again instead of a prefetched one. */}
        <p>
          <a className={textButton} href={PAYMENT_PATHS.returnPage(invitationId)}>
            {view.refresh}
          </a>
        </p>
      </>
    );
  }

  if (view.kind === "paid") {
    return (
      <>
        <p className={statusNote}>
          {view.amount === "" ? null : (
            <span className="font-medium">{PAYMENT_COPY.total(view.amount)}</span>
          )}
          {view.paidOn === "" ? null : <span className="mt-1 block">{view.paidOn}</span>}
        </p>
        <p>
          <a className={primaryButton} href={INVITATION_PATHS.detail(invitationId)}>
            {PAYMENT_COPY.backToInvitation}
          </a>
        </p>
      </>
    );
  }

  if (view.kind === "failed") {
    return (
      <>
        <p className={statusNote}>{view.body}</p>
        {view.amount === "" ? null : (
          <p className="font-medium text-ink">{PAYMENT_COPY.total(view.amount)}</p>
        )}
        <form action={action}>
          <input name="id" type="hidden" value={invitationId} />
          <button className={primaryButton} type="submit">
            {view.retry}
          </button>
        </form>
      </>
    );
  }

  // A package that needs no payment needs nothing here: the page's own header already goes back to the invitation.
  return null;
}

/**
 * The simulated provider page's buttons (S4). «Pagar» and «Simular rechazo» post the same emit with a different
 * outcome, so the whole signed intake runs in development instead of a status being written directly.
 */
export function SimulatedPaymentBody({
  action,
  invitationId,
  paymentId,
  view,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  paymentId: string;
  view: SimulatedPaymentView;
}) {
  if (view.kind === "unavailable") {
    // The page's heading and intro already say why, and its header offers the way back to the invitation.
    return null;
  }

  return (
    <>
      <p className="font-medium text-ink">{PAYMENT_COPY.total(view.amount)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <form action={action}>
          <input name="id" type="hidden" value={invitationId} />
          <input name="paymentId" type="hidden" value={paymentId} />
          <input name="outcome" type="hidden" value="paid" />
          <button className={primaryButton} type="submit">
            {view.pay}
          </button>
        </form>
        <form action={action}>
          <input name="id" type="hidden" value={invitationId} />
          <input name="paymentId" type="hidden" value={paymentId} />
          <input name="outcome" type="hidden" value="failed" />
          <button className={quietButton} type="submit">
            {view.reject}
          </button>
        </form>
      </div>
    </>
  );
}
