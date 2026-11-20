import type { InvitationPayment } from "../server/invitations-api.ts";
import { INVITATION_COPY } from "./copy.ts";

/**
 * Whether the publish block may promise that publishing has no cost (T3; S3).
 *
 * The payment state is the API's, and it says `paymentRequired: false` in exactly three situations: a deployment whose
 * payments run in free mode (no amount at all), a package whose price in force is zero, and a package that was already
 * paid. Only the first two are free packages, so a paid package stays out even after its payment went through, and a
 * payment state this page could not read promises nothing either: the copy only keeps «Publicar no tiene costo.» when
 * the answer proves it.
 */
function isFreePackage(payment: InvitationPayment | undefined): boolean {
  return (
    payment !== undefined &&
    !payment.paymentRequired &&
    payment.status !== "paid" &&
    (payment.amountMinor === null || payment.amountMinor === 0)
  );
}

/**
 * The hint of the publish block of a draft (T3; S3): today's text, «Publicar no tiene costo.», only for a free package
 * or a deployment in free mode, and the same hint without the price promise for every other case.
 */
export function publishHintFor(payment: InvitationPayment | undefined): string {
  return isFreePackage(payment) ? INVITATION_COPY.publishHint : INVITATION_COPY.publishHintCharged;
}
