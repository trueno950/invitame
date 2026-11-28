import { createParamDecorator, type ExecutionContext, NotFoundException } from "@nestjs/common";

import type { InvitationAccess } from "../application/invitation-access";

/** The stored id form a route may receive: PostgreSQL compares ids as uuids and refuses anything else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InvitationScopedRequest {
  params?: Record<string, string | undefined>;
  invitationAccess?: InvitationAccess;
}

/**
 * The invitation's owner, as `InvitationAccessGuard` resolved it for this request (F12; L17.4). Every owner-scoped port
 * of the API is asked for this id, so a collaborator's write runs inside the same ownership rule the owner's write
 * already follows, and no statement outside the guard decides who may reach the row.
 *
 * When the guard attached nothing the route must not assume the session user — that would treat a collaborator as the
 * owner — so it never does. A malformed id is passed through as it arrived: the route's own `ParseUUIDPipe` still
 * answers the 400 it always answered, and a route without that pipe answers the 404 its use case gives for an id no row
 * carries. A well-formed id with no resolved access is a programming error and answers the invitation's 404, which is
 * the safe direction: nothing runs.
 */
export const InvitationOwnerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<InvitationScopedRequest>();
    const access = request.invitationAccess;

    if (typeof access?.ownerId === "string" && access.ownerId !== "") {
      return access.ownerId;
    }
    const id = request.params?.id;
    if (typeof id === "string" && !UUID.test(id)) {
      return id;
    }

    throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
  },
);

/**
 * The whole resolved access of this request: who the caller is and what it may do. The reads that answer the caller's
 * own role (`GET /invitations/:id`) read it here, so the web half hides what a collaborator cannot do without ever
 * being the thing that decides it (L17.4). Like the owner id it never falls back to the session user.
 */
export const InvitationCallerAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): InvitationAccess => {
    const access = context.switchToHttp().getRequest<InvitationScopedRequest>().invitationAccess;

    if (access === undefined) {
      throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
    }
    return access;
  },
);
