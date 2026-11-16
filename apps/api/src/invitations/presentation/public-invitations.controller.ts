import {
  Body,
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  Param,
  Post,
  Req,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Observable } from "rxjs";

import { Public } from "../../auth/access-control/access-control";
import type { RuntimeEnvironment } from "../../config/environment";
import { PublicInvitationNotRenderableError } from "../application/invitation.application.errors";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import { SubmitPublicRsvpUseCase } from "../application/invitation-rsvp.use-cases";
import { type ClientAddressRequest, clientAddressOf } from "./client-address";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { SubmitRsvpDto } from "./dto/invitation-rsvp.dtos";
import {
  type PublicInvitationResponse,
  publicInvitationNotFound,
  toPublicInvitationResponse,
} from "./invitation.response";
import {
  mapRsvpError,
  RSVP_ACCEPTED_RESPONSE,
  type RsvpAcceptedResponse,
} from "./invitation-rsvp.response";

/**
 * Marks every answer of the public page as uncacheable (A6). The page is rendered per request, so nothing may
 * hold it: a cached 404 for a draft slug would keep hiding an invitation after its owner publishes it, and a
 * cached page would keep showing one after it is unpublished. It is an interceptor and not `@Header()` so the
 * header is also set on the 404 the handler throws.
 */
@Injectable()
class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader("Cache-Control", "no-store");

    return next.handle();
  }
}

/**
 * The guest's page of a published invitation (M5 T4; S1, S2, S3, A1, A3, A7). `@Public()` is deliberate: a guest
 * has no session, and the global guard must not even read one, so a broken session store cannot take the public
 * page down with it (L20). The slug is the only input and is passed through untouched: the use case refuses a
 * malformed slug before any query, so this route never validates format itself and every invisible case — a
 * malformed, unknown, draft, archived, or expired slug — answers the same 404 `PUBLIC_INVITATION_NOT_FOUND`
 * (A3). A published invitation whose renderer this deployment does not know is an operational fault: it is
 * logged once as a structured line without content or owner, and the guest still sees that same 404 (A3). What
 * the response carries is only the application's allow-listed projection: no owner, package, price, status, or
 * ids (A7), and never `expiresAt` (S8).
 */
@Controller("public/invitations")
@Public()
@UseInterceptors(NoStoreInterceptor)
export class PublicInvitationsController {
  private readonly logger = new Logger(PublicInvitationsController.name);

  constructor(
    @Inject(GetPublicInvitationUseCase)
    private readonly getPublic: GetPublicInvitationUseCase,
    @Inject(SubmitPublicRsvpUseCase)
    private readonly submitRsvp: SubmitPublicRsvpUseCase,
    @Inject(ConfigService)
    private readonly config: ConfigService<RuntimeEnvironment, true>,
  ) {}

  /** A published invitation as its guest renders it, or the one guest-facing 404 (A3, A7). */
  @Get(":slug")
  async read(@Param("slug") slug: string): Promise<PublicInvitationResponse> {
    try {
      const stored = await this.getPublic.execute(slug);

      return stored === null ? publicInvitationNotFound() : toPublicInvitationResponse(stored);
    } catch (error) {
      if (!(error instanceof PublicInvitationNotRenderableError)) {
        throw error;
      }
      // One structured line: the renderer the deployment lacks and the public slug — never the content or the
      // owner, because an operational log is not an audit trail and is not the guest's page (A3, A7).
      this.logger.warn({
        event: "public-invitation-not-renderable",
        slug,
        componentKey: error.componentKey,
      });

      return publicInvitationNotFound();
    }
  }

  /**
   * One guest's open RSVP submission (M6 G1; S1, S4). `@Public()` for the same reason the read is: a guest has no
   * session, so the guard never reads one. The slug is the only input that names the invitation. Every accepted
   * attempt — stored, updated, or dropped because the honeypot was filled — answers the same 202 with the same
   * minimal body, so a bot cannot tell a recorded response from a discarded one and no guest ever reads another
   * guest's data. A slug the page itself would not render is the same 404 as the read; a published invitation that
   * does not accept responses is 409 `RSVP_NOT_OPEN`; an address over its cap is 429 `RSVP_RATE_LIMITED`; and a
   * payload the domain refuses is 400 `INVALID_RSVP` with its issues.
   */
  @Post(":slug/rsvp")
  @HttpCode(202)
  async submit(
    @Param("slug") slug: string,
    @Body() body: SubmitRsvpDto,
    @Req() request: ClientAddressRequest,
  ): Promise<RsvpAcceptedResponse> {
    try {
      const answered = await this.submitRsvp.execute({
        slug,
        name: body.name,
        attending: body.attending,
        partySize: body.partySize,
        phone: body.phone,
        message: body.message,
        honeypot: body.honeypot,
        clientAddress: clientAddressOf(request, this.clientIpHeader()),
      });

      // An invisible slug is the same 404 the read above answers; every accepted attempt — stored, updated, or
      // dropped by the honeypot — answers the same 202 with the same body.
      return answered ? RSVP_ACCEPTED_RESPONSE : publicInvitationNotFound();
    } catch (error) {
      return mapRsvpError(error);
    }
  }

  /**
   * The lower-case header that names the client address for the per-address rate limit: the same validated header
   * Better Auth's rate limits read, so the deployment configures it once.
   */
  private clientIpHeader(): string {
    return this.config.get("AUTH_CLIENT_IP", { infer: true }).header;
  }
}
