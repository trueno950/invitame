import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";

import { SessionUserId } from "../../auth/access-control/session-user-id";
import {
  GetInvitationPaymentUseCase,
  StartCheckoutUseCase,
} from "../application/payment.use-cases";
import {
  type CheckoutResponse,
  type InvitationPaymentResponse,
  mapPaymentError,
  paymentInvitationNotFound,
  toCheckoutResponse,
  toInvitationPaymentResponse,
} from "./payment.response";

const INVITATION_ID = new ParseUUIDPipe();

/**
 * The owner's payment routes (M7 S4). No `@Public()`: the global guard requires an active session, and the owner is
 * only ever `@SessionUserId()` — never the path, the query, or the body (S9). Another customer's invitation answers
 * the same 404 as an unknown one (A4). `POST /invitations/:id/checkout` answers 200 and not 201, because a repeated
 * checkout resumes the same pending payment instead of creating a second resource (S4).
 *
 * - `POST /invitations/:id/checkout`: 200 `{ paymentId, redirectUrl, amountMinor, currency }`; 409
 *   `PAYMENTS_DISABLED` in free mode, `PAYMENT_NOT_REQUIRED` for a zero price, `PAYMENT_PRICE_UNAVAILABLE` when the
 *   catalog cannot price the package, `PAYMENT_ALREADY_PAID`, `INVITATION_PACKAGE_LOCKED_BY_PAYMENT`, or
 *   `INVITATION_NOT_EDITABLE` for an archived invitation; 503 `PAYMENT_PROVIDER_UNAVAILABLE`.
 * - `GET /invitations/:id/payment`: 200 `{ paymentRequired, status, amountMinor, currency, paidAt }`.
 */
@Controller("invitations")
export class InvitationPaymentsController {
  constructor(
    @Inject(StartCheckoutUseCase) private readonly checkout: StartCheckoutUseCase,
    @Inject(GetInvitationPaymentUseCase)
    private readonly readPayment: GetInvitationPaymentUseCase,
  ) {}

  @Post(":id/checkout")
  @HttpCode(200)
  async startCheckout(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<CheckoutResponse> {
    try {
      const result = await this.checkout.execute({ ownerId: userId, invitationId: id });

      return toCheckoutResponse(result ?? paymentInvitationNotFound());
    } catch (error) {
      return mapPaymentError(error);
    }
  }

  @Get(":id/payment")
  async read(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<InvitationPaymentResponse> {
    const status = await this.readPayment.execute({ ownerId: userId, invitationId: id });

    return toInvitationPaymentResponse(status ?? paymentInvitationNotFound());
  }
}
