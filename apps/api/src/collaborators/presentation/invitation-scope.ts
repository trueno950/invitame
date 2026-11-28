import { createParamDecorator, type ExecutionContext, NotFoundException } from "@nestjs/common";

import type { InvitationAccess } from "../application/invitation-access";
import type { InvitationRouteNotFound } from "./invitation-access.guard";

interface InvitationScopedRequest {
  params?: Record<string, string | undefined>;
  invitationAccess?: InvitationAccess;
  /** The 404 body the route's controller declared, attached by `InvitationAccessGuard` (F12; L17.4). */
  invitationRouteNotFound?: InvitationRouteNotFound;
}

/** The invitation's 404, or the body the route's own module answers for it (the media routes keep `MEDIA_NOT_FOUND`). */
function invitationNotFound(request: InvitationScopedRequest): never {
  throw new NotFoundException({
    ...(request.invitationRouteNotFound ?? { code: "INVITATION_NOT_FOUND" }),
  });
}

/**
 * The invitation's owner, as `InvitationAccessGuard` resolved it for this request (F12; L17.4). Every owner-scoped port
 * of the API is asked for this id, so a collaborator's write runs inside the same ownership rule the owner's write
 * already follows, and no statement outside the guard decides who may reach the row.
 *
 * Only the guard's answer is ever an owner. When the guard attached nothing — a route that lost its guard, or a request
 * the guard passed through — this answers the invitation's 404, exactly as an unknown invitation does: the path id is
 * not an owner (PostgreSQL would compare it as one) and the session user is not the owner when the caller is a
 * collaborator, so neither may stand in for the resolved value. Nothing runs.
 */
export const InvitationOwnerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<InvitationScopedRequest>();
    const access = request.invitationAccess;

    if (typeof access?.ownerId === "string" && access.ownerId !== "") {
      return access.ownerId;
    }

    return invitationNotFound(request);
  },
);

/**
 * The whole resolved access of this request: who the caller is and what it may do. The reads that answer the caller's
 * own role (`GET /invitations/:id`, and the writes that answer the invitation they changed) read it here, so the web half
 * hides what a collaborator cannot do without ever being the thing that decides it (L17.4). Like the owner id it never
 * falls back to the session user.
 */
export const InvitationCallerAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): InvitationAccess => {
    const request = context.switchToHttp().getRequest<InvitationScopedRequest>();
    const access = request.invitationAccess;

    if (access === undefined) {
      return invitationNotFound(request);
    }

    return access;
  },
);
