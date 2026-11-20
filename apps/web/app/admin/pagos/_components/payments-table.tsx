import { PAYMENTS_COPY } from "../../../../lib/admin/payments/copy.ts";
import { paymentRowView } from "../../../../lib/admin/payments/rows.ts";
import type { AdminPayment } from "../../../../lib/server/admin-payments-client.ts";
import {
  adminButtonVariant,
  adminCard,
  adminTable,
  adminTableCell,
  adminTableHead,
  adminTableRow,
} from "../../_components/admin-ui.ts";

/**
 * The administrator's refund list (M7 T3; S3): one row per paid payment, with its invitation slug, its amount, its paid
 * date, and a refund button only when the API reports the payment as refundable. A row without the button says why,
 * because the rule «Sin reembolso tras publicar» is a fact of the payment, not a hidden control — the API refuses the
 * refund either way, and this page is never the guard.
 *
 * Each refund is its own form posting to the server action, so it works without JavaScript like the catalog pages. The
 * page stays a server component: the only interactivity is the browser's own form submission.
 */
export function PaymentsTable({
  action,
  payments,
}: {
  action: (formData: FormData) => Promise<void>;
  payments: readonly AdminPayment[];
}) {
  return (
    <div className={adminCard}>
      <div className="border-b border-admin-border px-4 py-2.5">
        <p className="text-xs text-admin-muted">
          {payments.length === 0 ? PAYMENTS_COPY.empty : PAYMENTS_COPY.tableCaption}
        </p>
        {payments.some((payment) => payment.refundable) ? (
          <p className="mt-1 text-xs leading-5 text-admin-muted">{PAYMENTS_COPY.refundHint}</p>
        ) : null}
      </div>
      {payments.length === 0 ? null : (
        <div className="overflow-x-auto">
          <table className={adminTable}>
            <caption className="sr-only">{PAYMENTS_COPY.tableCaption}</caption>
            <thead>
              <tr>
                <th className={adminTableHead} scope="col">
                  {PAYMENTS_COPY.slugColumn}
                </th>
                <th className={adminTableHead} scope="col">
                  {PAYMENTS_COPY.paymentColumn}
                </th>
                <th className={`${adminTableHead} text-right`} scope="col">
                  {PAYMENTS_COPY.amountColumn}
                </th>
                <th className={adminTableHead} scope="col">
                  {PAYMENTS_COPY.paidAtColumn}
                </th>
                <th className={`${adminTableHead} text-right`} scope="col">
                  {PAYMENTS_COPY.actionColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const row = paymentRowView(payment);

                return (
                  <tr className={adminTableRow} key={row.paymentId}>
                    <td className={adminTableCell}>
                      <span className="font-medium text-admin-ink">{row.slug}</span>
                      <span className="mt-0.5 block text-xs text-admin-muted">
                        {row.statusLabel}
                      </span>
                    </td>
                    <td
                      className={`${adminTableCell} font-mono text-xs break-all text-admin-muted`}
                    >
                      {row.paymentId}
                    </td>
                    <td className={`${adminTableCell} text-right tabular-nums`}>
                      {row.amount === "" ? null : row.amount}
                    </td>
                    <td className={`${adminTableCell} whitespace-nowrap text-admin-muted`}>
                      {row.paidOn}
                    </td>
                    <td className={`${adminTableCell} text-right`}>
                      {row.refund === undefined ? (
                        <span className="text-xs leading-5 text-admin-muted">{row.note}</span>
                      ) : (
                        <form action={action}>
                          <input name="paymentId" type="hidden" value={row.paymentId} />
                          <button className={adminButtonVariant("outline", "small")} type="submit">
                            {row.refund}
                            <span className="sr-only"> {row.slug}</span>
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
