import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { InvitationPasswordGate } from "../application/invitation-lock";
import { invitationLocked } from "./invitation-password.response";

// The guard every public invitation route declares (F13; S2.13, L18.2). It runs after the global session guard (the
// routes are `@Public()`, so the global guard admits every caller) and before the route's own handler, and it is the one
// place that decides whether a request may reach an invitation that stores an access code.
//
// The declaration is the review: a public controller of this API names this guard once, at class level, so a route added
// later is gated by default. The two personal guest routes and the unlock route itself are the only exceptions, and each
// one states it with `@SkipInvitationPassword()`; the HTTP suite reads the registered public controllers and fails when a
// public invitation route is neither gated nor one of those exact exemptions.
//
// What the guard does not do: it never reads a session, never touches the invitation's content beyond the display name the
// locked answer carries, and never logs. A locked request is refused before the route runs, so no read, write, upload, or
// view count happens for it.

/** The metadata `@SkipInvitationPassword()` writes; read by the guard and by the HTTP suite. */
export const SKIP_INVITATION_PASSWORD_GATE = "skipInvitationPasswordGate";

/**
 * `@SkipInvitationPassword()`: this route is reachable while the invitation is locked (L18.4). Only two kinds of route
 * may declare it — a guest's personal link, which already carries a secret of its own, and the unlock route itself — and
 * the HTTP suite asserts that the exempt routes are exactly those.
 */
export function SkipInvitationPassword(): MethodDecorator {
  return SetMetadata(SKIP_INVITATION_PASSWORD_GATE, true);
}

/** The header a public request presents its access token in (L18.5): the web sets it from its own `HttpOnly` cookie. */
export const INVITATION_ACCESS_HEADER = "x-invitation-access";

/** The one request field this guard reads: the path parameters and the headers. */
interface PasswordGateRequest {
  params?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * One value of a header that may arrive more than once. A repeated header is not an answer this guard can trust, so it
 * reads the first value only — the same rule the client-address resolver follows — and a value with only whitespace is
 * no token at all.
 */
export function readInvitationAccessToken(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers[INVITATION_ACCESS_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const token = value?.trim() ?? "";

  return token === "" ? undefined : token;
}

/**
 * Refuses a request to a locked invitation unless it presents a token minted for that invitation and its current password
 * version (L18.2). The locked answer is the module's own 423 with the display name and nothing else; a request to an
 * address no visible invitation holds passes through so the route answers its own 404, and so does an invitation with no
 * code, so nothing about an unlocked invitation changes.
 */
@Injectable()
export class InvitationLockGuard implements CanActivate {
  constructor(
    @Inject(InvitationPasswordGate)
    private readonly gate: InvitationPasswordGate,
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipped = this.reflector.getAllAndOverride<boolean>(SKIP_INVITATION_PASSWORD_GATE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipped === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<PasswordGateRequest>();
    // A store failure is an error, never a pass: the guard refuses a request it cannot judge instead of serving an
    // invitation that may be locked.
    const decision = await this.gate.check(
      request.params?.slug,
      readInvitationAccessToken(request.headers ?? {}),
    );

    if (decision.locked) {
      invitationLocked(decision.displayName);
    }

    return true;
  }
}
