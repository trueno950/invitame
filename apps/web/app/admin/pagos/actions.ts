"use server";

import { redirect } from "next/navigation";

import { refundPayment } from "../../../lib/admin/payments/commands.ts";
import { adminPayments } from "../../../lib/server/admin-payments-api.ts";

/**
 * The refund server action (M7 T3; S3, S4). The browser cannot send the command itself and must never be the guard, so
 * it runs here, on the web server, with the session cookie, and the API answers `@AdminOnly()`. The action passes the
 * submitted form to its command and redirects to the path the command answers (303 after POST), so the form works
 * without JavaScript and a reload never resubmits it. The API decides every refusal and changes no payment state from
 * this request: `refunded` arrives from the verified provider notification. `redirect` is called outside any `try`, as
 * Next.js requires.
 */
export async function refundPaymentAction(formData: FormData): Promise<void> {
  redirect(await refundPayment(adminPayments, formData));
}
