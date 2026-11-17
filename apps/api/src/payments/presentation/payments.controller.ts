import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";

import { Public } from "../../auth/access-control/access-control";
import { SessionUserId } from "../../auth/access-control/session-user-id";
import { EmitSimulatedPaymentUseCase } from "../application/payment.use-cases";
import { HandlePaymentWebhookUseCase } from "../application/payment-webhook.use-case";
// The global ValidationPipe reads this class from emitted metadata, so it is a value import.
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { EmitSimulatedPaymentDto } from "./dto/emit-simulated-payment.dto";
import { mapPaymentError, type PaymentWebhookResponse } from "./payment.response";

const PAYMENT_ID = new ParseUUIDPipe();

/** The raw request the webhook route reads: the parsed JSON body is never what the signature covers. */
interface RawBodyRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: unknown;
}

/**
 * The provider webhook and the development emit (M7 S1, S4).
 *
 * `POST /payments/webhooks/:provider` is `@Public()`: a provider has no session, and the route proves the delivery
 * with the adapter's signature over the *raw* body instead (`createApp` keeps the raw buffer on the request). It
 * answers 200 `{ outcome: "processed" }` for an event it stored, 200 `{ outcome: "duplicate" }` for one already
 * stored — so a provider retry is safe — 400 `PAYMENT_WEBHOOK_REJECTED` without any detail for an unsigned, stale,
 * forged, or malformed delivery (nothing is written), and 404 `PAYMENT_PROVIDER_NOT_FOUND` for a provider this
 * deployment does not configure.
 *
 * `POST /payments/simulated/:paymentId/emit` is the development-only shortcut (S4): it requires the owner's session,
 * refuses unless the deployment runs `simulated`, and posts a signed body through the same intake, so development
 * exercises the whole verification instead of writing a status.
 */
@Controller("payments")
export class PaymentsController {
  constructor(
    @Inject(HandlePaymentWebhookUseCase)
    private readonly webhook: HandlePaymentWebhookUseCase,
    @Inject(EmitSimulatedPaymentUseCase)
    private readonly emitSimulated: EmitSimulatedPaymentUseCase,
  ) {}

  @Post("webhooks/:provider")
  @Public()
  @HttpCode(200)
  async receiveWebhook(
    @Param("provider") provider: string,
    @Req() request: RawBodyRequest,
  ): Promise<PaymentWebhookResponse> {
    try {
      // The raw bytes the provider signed; a body parser's re-serialization would not verify.
      const rawBody = Buffer.isBuffer(request.rawBody) ? request.rawBody.toString("utf8") : "";
      const result = await this.webhook.execute({
        provider,
        rawBody,
        headers: request.headers,
        receivedAt: new Date(),
      });

      return { outcome: result.outcome };
    } catch (error) {
      return mapPaymentError(error);
    }
  }

  @Post("simulated/:paymentId/emit")
  @HttpCode(200)
  async emit(
    @SessionUserId() userId: string,
    @Param("paymentId", PAYMENT_ID) paymentId: string,
    @Body() body: EmitSimulatedPaymentDto,
  ): Promise<PaymentWebhookResponse> {
    try {
      const result = await this.emitSimulated.execute({
        ownerId: userId,
        paymentId,
        outcome: body.outcome,
      });

      return { outcome: result.outcome };
    } catch (error) {
      return mapPaymentError(error);
    }
  }
}
