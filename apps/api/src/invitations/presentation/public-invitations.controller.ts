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
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Observable } from "rxjs";

import { Public } from "../../auth/access-control/access-control";
import type { RuntimeEnvironment } from "../../config/environment";
import { PublicInvitationNotRenderableError } from "../application/invitation.application.errors";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import { UnlockInvitationUseCase } from "../application/invitation-unlock.use-cases";
import {
  type InvitationViewSource,
  RecordInvitationViewUseCase,
} from "../application/invitation-views";
import {
  GetPublicGuestUseCase,
  SubmitGuestRsvpUseCase,
} from "../application/invitation-guest.use-cases";
import { SubmitPublicRsvpUseCase } from "../application/invitation-rsvp.use-cases";
import { SubmitPublicGuestbookEntryUseCase } from "../application/invitation-guestbook.use-cases";
import { type ClientAddressRequest, clientAddressOf } from "./client-address";
// biome-ignore lint/style/useImportType: the pipe needs the classes at runtime.
import { UnlockInvitationDto } from "./dto/invitation-password.dtos";
import { InvitationLockGuard, SkipInvitationPassword } from "./invitation-lock.guard";
import {
  type InvitationUnlockedResponse,
  mapInvitationUnlockError,
  orInvitationUnlocked,
} from "./invitation-password.response";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { SubmitGuestRsvpDto } from "./dto/invitation-guest.dtos";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { SubmitGuestbookEntryDto } from "./dto/invitation-guestbook.dtos";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { SubmitRsvpDto } from "./dto/invitation-rsvp.dtos";
import {
  type PublicInvitationResponse,
  publicInvitationNotFound,
  toPublicInvitationResponse,
} from "./invitation.response";
import {
  mapGuestError,
  type PublicGuestInvitationResponse,
  toPublicGuestInvitationResponse,
} from "./invitation-guest.response";
import {
  mapRsvpError,
  RSVP_ACCEPTED_RESPONSE,
  type RsvpAcceptedResponse,
} from "./invitation-rsvp.response";
import {
  GUESTBOOK_ACCEPTED_RESPONSE,
  type GuestbookAcceptedResponse,
  mapGuestbookError,
} from "./invitation-guestbook.response";

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
 *
 * Every served page counts one opening of the link it came through (M9 T11; S2, S7, L12): `PUBLIC` for this page,
 * `GUEST` for a guest's personal link, and never a 404, an unrenderable invitation, an RSVP submission, or the owner's
 * own preview. The count is fire-and-forget — the guest never waits for it, and a failure is one structured line
 * instead of a different answer — so the opening counter can never take the public page down.
 *
 * F13 (S2.13, L18.2) adds the gate: the class declares `InvitationLockGuard`, so every route below — the page, the open
 * RSVP, and the guestbook — is refused with the locked answer while the invitation stores an access code and the request
 * presents no valid access token. The two personal-link routes and the unlock route declare `@SkipInvitationPassword()`:
 * a personal link already carries a secret of its own (L18.4), and the unlock route is how a token is obtained.
 */
@Controller("public/invitations")
@Public()
@UseGuards(InvitationLockGuard)
@UseInterceptors(NoStoreInterceptor)
export class PublicInvitationsController {
  private readonly logger = new Logger(PublicInvitationsController.name);

  constructor(
    @Inject(GetPublicInvitationUseCase)
    private readonly getPublic: GetPublicInvitationUseCase,
    @Inject(SubmitPublicRsvpUseCase)
    private readonly submitRsvp: SubmitPublicRsvpUseCase,
    @Inject(GetPublicGuestUseCase)
    private readonly getPublicGuest: GetPublicGuestUseCase,
    @Inject(SubmitGuestRsvpUseCase)
    private readonly submitGuestRsvp: SubmitGuestRsvpUseCase,
    @Inject(SubmitPublicGuestbookEntryUseCase)
    private readonly submitGuestbookEntry: SubmitPublicGuestbookEntryUseCase,
    @Inject(UnlockInvitationUseCase)
    private readonly unlockInvitation: UnlockInvitationUseCase,
    @Inject(RecordInvitationViewUseCase)
    private readonly recordView: RecordInvitationViewUseCase,
    @Inject(ConfigService)
    private readonly config: ConfigService<RuntimeEnvironment, true>,
  ) {}

  /** A published invitation as its guest renders it, or the one guest-facing 404 (A3, A7). */
  @Get(":slug")
  async read(@Param("slug") slug: string): Promise<PublicInvitationResponse> {
    try {
      const stored = await this.getPublic.execute(slug);
      if (stored === null) {
        return publicInvitationNotFound();
      }
      // Counted only here: the invitation resolved and its renderer exists, so this answer is a served opening.
      this.countView(stored.invitationId, "PUBLIC");

      return toPublicInvitationResponse(stored);
    } catch (error) {
      if (!(error instanceof PublicInvitationNotRenderableError)) {
        throw error;
      }
      // One structured line: the renderer the deployment lacks and the public slug — never the content or the
      // owner, because an operational log is not an audit trail and is not the guest's page (A3, A7).
      this.logNotRenderable(slug, error.componentKey);

      return publicInvitationNotFound();
    }
  }

  /**
   * One guest's personal page (M6 G2; S4): the same published public read as above, plus a `guest` block with this
   * guest's name, seats, last answer, and whether the access QR is offered. `@Public()` for the same reason: a guest
   * has no session, so the guard never reads one. Every invisible case — a malformed, unknown, draft, archived, or
   * expired slug, a malformed, unknown, or revoked token, and a token of another invitation — answers the same 404
   * `PUBLIC_INVITATION_NOT_FOUND`, so the route never confirms that a guest exists (A3, S4). Nothing about another
   * guest is read, and the body is uncacheable.
   */
  @Get(":slug/guests/:token")
  @SkipInvitationPassword()
  async readGuest(
    @Param("slug") slug: string,
    @Param("token") token: string,
  ): Promise<PublicGuestInvitationResponse> {
    try {
      const stored = await this.getPublicGuest.execute(slug, token);
      if (stored === null) {
        return publicInvitationNotFound();
      }
      // A personal link is its own source (S7): the same guest may also open the plain page, and that is another
      // opening of another link.
      this.countView(stored.page.invitationId, "GUEST");

      return toPublicGuestInvitationResponse(stored);
    } catch (error) {
      if (!(error instanceof PublicInvitationNotRenderableError)) {
        throw error;
      }
      this.logNotRenderable(slug, error.componentKey);

      return publicInvitationNotFound();
    }
  }

  /**
   * One guest's answer through their personal link (M6 G2; S4). `@Public()` for the same reason. The slug and the
   * token are the only inputs that name the invitation and the guest; the answer's name, phone, and seats come from
   * the guest record, never from the body. Every accepted attempt — a first answer or a change of mind — answers the
   * same 202 with the same minimal body, and an invisible slug, token, or a token of another invitation answers the
   * same 404 as the reads (A3). An invitation that does not take personal answers and a passed deadline are 409
   * `RSVP_NOT_OPEN`, a submission over the guest's own cap is 429 `RSVP_RATE_LIMITED`, and a payload the domain
   * refuses is 400 `INVALID_RSVP` with its issues.
   */
  @Post(":slug/guests/:token/rsvp")
  @HttpCode(202)
  @SkipInvitationPassword()
  async submitGuest(
    @Param("slug") slug: string,
    @Param("token") token: string,
    @Body() body: SubmitGuestRsvpDto,
  ): Promise<RsvpAcceptedResponse> {
    try {
      const answered = await this.submitGuestRsvp.execute({
        slug,
        token,
        attending: body.attending,
        partySize: body.partySize,
        companions: body.companions,
        dietaryNotes: body.dietaryNotes,
        message: body.message,
      });

      return answered ? RSVP_ACCEPTED_RESPONSE : publicInvitationNotFound();
    } catch (error) {
      return mapGuestError(error);
    }
  }

  /**
   * Counts one served opening without making the guest wait for it (M9 T11; S2, S7): the write is started and never
   * awaited, and its failure is one structured line with no slug, no id, and no visitor — an operational signal, not a
   * record of who opened the page. The answer is already built from the projection, so nothing about it can change.
   */
  private countView(invitationId: string, source: InvitationViewSource): void {
    void this.recordView.execute({ invitationId, source }).catch(() => {
      this.logger.warn({ event: "invitation_view_count_failed" });
    });
  }

  /**
   * The one structured line of an unrenderable invitation: the missing renderer and the public slug, never the
   * content, the owner, or a guest. It is emitted from both public pages so the operational signal is identical.
   */
  private logNotRenderable(slug: string, componentKey: string | null): void {
    this.logger.warn({ event: "public-invitation-not-renderable", slug, componentKey });
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
        companions: body.companions,
        dietaryNotes: body.dietaryNotes,
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
   * One guest's signature on the invitation's wall (F7; S2.7, L10.3). `@Public()` for the same reason the other guest
   * routes are: a guest has no session, so the guard never reads one. The slug is the only input that names the
   * invitation. Every accepted attempt — stored or dropped because the honeypot was filled — answers the same 202 with
   * the same minimal body, so a bot cannot tell a recorded signature from a discarded one. A slug the page itself would
   * not render is the same 404 as the read; a visible invitation whose wall takes no signature (the package does not
   * grant `GUESTBOOK`, or the invitation expired) is 409 `GUESTBOOK_CLOSED`; an address over its cap is 429
   * `GUESTBOOK_RATE_LIMITED`; and a signature the domain refuses is 400 `INVALID_GUESTBOOK_ENTRY` with its issues.
   */
  @Post(":slug/guestbook")
  @HttpCode(202)
  async signGuestbook(
    @Param("slug") slug: string,
    @Body() body: SubmitGuestbookEntryDto,
    @Req() request: ClientAddressRequest,
  ): Promise<GuestbookAcceptedResponse> {
    try {
      const signed = await this.submitGuestbookEntry.execute({
        slug,
        authorName: body.authorName,
        message: body.message,
        honeypot: body.honeypot,
        clientAddress: clientAddressOf(request, this.clientIpHeader()),
      });

      // An invisible slug is the same 404 the read above answers.
      return signed ? GUESTBOOK_ACCEPTED_RESPONSE : publicInvitationNotFound();
    } catch (error) {
      return mapGuestbookError(error);
    }
  }

  /**
   * The exchange a guest makes from the lock screen (F13; S2.13, L18.2): the shared access code in, an access token out.
   * `@SkipInvitationPassword()` because this is the route that mints the token the other routes accept. The slug is the
   * only input that names the invitation, and the code is the only input that attempts to open it; the token is signed over
   * the invitation id, its current password version, and an expiry 30 days ahead, so a changed or removed code stops every
   * token minted before it. An attempt over this address's cap for this invitation is 429 and a code that does not match is
   * 401, both with the one neutral body; a malformed body is 400 from the global pipe.
   */
  @Post(":slug/unlock")
  @HttpCode(200)
  @SkipInvitationPassword()
  async unlock(
    @Param("slug") slug: string,
    @Body() body: UnlockInvitationDto,
    @Req() request: ClientAddressRequest,
  ): Promise<InvitationUnlockedResponse> {
    try {
      return orInvitationUnlocked(
        await this.unlockInvitation.execute({
          slug,
          password: body.password,
          clientAddress: clientAddressOf(request, this.clientIpHeader()),
        }),
      );
    } catch (error) {
      return mapInvitationUnlockError(error);
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
