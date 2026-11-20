import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";

import { AdminOnly } from "../../auth/access-control/access-control";
import { GetAdminPaymentDetailUseCase } from "../application/admin-payment-detail.use-cases";
import { ListAdminPaymentsUseCase, RefundPaymentUseCase } from "../application/refund.use-cases";
// The global ValidationPipe reads this class from emitted metadata, so it is a value import.
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { ListAdminPaymentsDto } from "./dto/list-admin-payments.dto";
import {
  type AdminPaymentDetailResponse,
  type AdminPaymentResponse,
  mapPaymentError,
  type RefundPaymentResponse,
  toAdminPaymentDetailResponse,
  toAdminPaymentResponse,
  toRefundPaymentResponse,
} from "./payment.response";

const PAYMENT_ID = new ParseUUIDPipe();

/**
 * Administrator refunds (T2, S3, S4). `@AdminOnly()` on the class: the global guard answers 401 without an active
 * session and 403 to a user whose stored role is not `ADMIN`, before any input is validated. Nothing here reads a
 * payer: the read carries the invitation slug and the payment's own snapshot, and the refusals carry only a code.
 *
 * - `GET /admin/payments?status=paid&limit=<1..50>`: 200 with the newest paid payments, each with its invitation slug
 *   and a `refundable` flag (paid and never published). `status` is a closed set of one and `limit` is bounded, so
 *   the read is bounded even when the query omits them; a malformed value answers 400.
 * - `GET /admin/payments/:paymentId`: 200 with one payment, its invitation slug, and its newest fifty events (newest
 *   first), or 404 `PAYMENT_NOT_FOUND`. It is read-only and not audited (S4, S6, L9), and it carries no payer datum,
 *   provider reference, idempotency key, or payload digest. An id that is not a UUID answers 400.
 * - `POST /admin/payments/:paymentId/refund`: 200 `{ outcome: "requested" }` after the provider accepted the command;
 *   404 `PAYMENT_NOT_FOUND`, 409 `PAYMENT_NOT_REFUNDABLE` unless the payment is `paid`, 409
 *   `INVITATION_ALREADY_PUBLISHED` when the invitation was ever published, and 503 `PAYMENT_PROVIDER_UNAVAILABLE`
 *   when the provider refuses or cannot be reached. It never changes the payment: `refunded` arrives from the
 *   verified provider notification (S3, S4).
 */
@AdminOnly()
@Controller("admin/payments")
export class AdminPaymentsController {
  constructor(
    @Inject(RefundPaymentUseCase) private readonly refundPayment: RefundPaymentUseCase,
    @Inject(ListAdminPaymentsUseCase) private readonly listPayments: ListAdminPaymentsUseCase,
    @Inject(GetAdminPaymentDetailUseCase)
    private readonly readPayment: GetAdminPaymentDetailUseCase,
  ) {}

  @Get()
  async list(@Query() query: ListAdminPaymentsDto): Promise<AdminPaymentResponse[]> {
    const payments = await this.listPayments.execute({ limit: query.limit });

    return payments.map(toAdminPaymentResponse);
  }

  @Get(":paymentId")
  async detail(
    @Param("paymentId", PAYMENT_ID) paymentId: string,
  ): Promise<AdminPaymentDetailResponse> {
    try {
      return toAdminPaymentDetailResponse(await this.readPayment.execute({ paymentId }));
    } catch (error) {
      return mapPaymentError(error);
    }
  }

  @Post(":paymentId/refund")
  @HttpCode(200)
  async refund(@Param("paymentId", PAYMENT_ID) paymentId: string): Promise<RefundPaymentResponse> {
    try {
      return toRefundPaymentResponse(await this.refundPayment.execute({ paymentId }));
    } catch (error) {
      return mapPaymentError(error);
    }
  }
}
