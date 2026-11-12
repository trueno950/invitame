import {
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  Param,
  UseInterceptors,
} from "@nestjs/common";
import type { Observable } from "rxjs";

import { Public } from "../../auth/access-control/access-control";
import { PublicInvitationNotRenderableError } from "../application/invitation.application.errors";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import {
  type PublicInvitationResponse,
  publicInvitationNotFound,
  toPublicInvitationResponse,
} from "./invitation.response";

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
}
