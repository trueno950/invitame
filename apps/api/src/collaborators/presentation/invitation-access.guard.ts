import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  type InvitationAccess as InvitationAccessGrant,
  type InvitationAccessResolver,
  INVITATION_ACCESS_RESOLVER,
  isInvitationRowId,
} from "../application/invitation-access";
import {
  type InvitationPermission,
  grantsInvitationPermission,
} from "../domain/invitation-collaborator";

// The route-level authorization of every invitation route (F12; S2.12, L17.4). One resolver answers owner, collaborator
// with permissions, or nothing; each route declares what it needs next to its handler, and a route that declares
// nothing is owner-only, so the default is denial. Two decorators express the two shapes:
//
//   @RequireInvitationPermission("EDIT_CONTENT")             a collaborator holding that permission, or the owner
//   @RequireInvitationPermission("EDIT_CONTENT", "PUBLISH")  a collaborator holding any of them, or the owner
//   @InvitationOwnerOnly()                                   the owner alone: a collaborator gets 403 even holding all three
//
// The declaration is metadata, so the same declaration is what the authorization matrix test enumerates: a new route
// whose handler carries none fails that test (and the startup check), which is how "declared" and "reviewed" stay the
// same act. A caller with no access at all answers the module's own 404 — `INVITATION_NOT_FOUND` unless the controller
// declared another documented body — so a foreign invitation stays indistinguishable from an unknown one, exactly as
// before. A collaborator who lacks the declared permission answers 403 `INVITATION_FORBIDDEN`.

/** Key of the route's declaration. A handler and its controller are both read, the handler first. */
export const INVITATION_ROUTE_ACCESS = Symbol("invitame:invitation-route-access");

/** Key of the 404 body a controller answers for a caller with no access. */
const INVITATION_ROUTE_NOT_FOUND = Symbol("invitame:invitation-route-not-found");

/** Key of the declaration that a controller's `:id` is a uuid its routes refuse with 400 when it is not. */
const INVITATION_ROUTE_UUID_ID = Symbol("invitame:invitation-route-uuid-id");

/** What a route declares: the permissions any of which admits a collaborator; empty means the owner alone. */
export interface InvitationRouteAccess {
  readonly anyOf: readonly InvitationPermission[];
}

/** The body of the "no access" 404: the module's own code, and its message when the module states one. */
export interface InvitationRouteNotFound {
  readonly code: string;
  readonly message?: string;
}

const OWNER_ONLY: InvitationRouteAccess = Object.freeze({ anyOf: [] });

/**
 * Declares that a route admits an accepted collaborator holding any of these permissions, and of course the owner.
 * Called with no permission it means owner-only, which is also what an undeclared route gets.
 */
export const RequireInvitationPermission = (...anyOf: InvitationPermission[]) =>
  SetMetadata(INVITATION_ROUTE_ACCESS, { anyOf: Object.freeze([...anyOf]) });

/** Declares a route no collaborator can reach, whatever permissions it holds (L17.2): the owner alone. */
export const InvitationOwnerOnly = () => SetMetadata(INVITATION_ROUTE_ACCESS, OWNER_ONLY);

/**
 * Declares the 404 body a controller answers when the caller has no access to the invitation it named. The media
 * routes answer `MEDIA_NOT_FOUND` and have always done so; every other module answers `INVITATION_NOT_FOUND`. The
 * status is 404 either way, so a foreign invitation never becomes distinguishable from an unknown one.
 */
export const InvitationRouteNotFoundBody = (body: InvitationRouteNotFound) =>
  SetMetadata(INVITATION_ROUTE_NOT_FOUND, Object.freeze({ ...body }));

/**
 * Declares that this controller's `:id` is a uuid: a value that is not one is answered with the same 400 the route's own
 * `ParseUUIDPipe` answers, before any resolver read. The guard states it because a guard runs before pipes and Nest does
 * not order the two, so without this declaration a malformed id could reach the resolver — and the database refuses to
 * cast it — instead of earning the documented 400.
 */
export const InvitationRouteIdIsUuid = () => SetMetadata(INVITATION_ROUTE_UUID_ID, true);

type MetadataTarget = Parameters<Reflector["getAllAndOverride"]>[1][number];

/** The declaration a route carries, or undefined when it carries none (which the guard reads as owner-only). */
export function readInvitationRouteAccess(
  reflector: Reflector,
  handler: MetadataTarget,
  controller: MetadataTarget,
): InvitationRouteAccess | undefined {
  return reflector.getAllAndOverride<InvitationRouteAccess>(INVITATION_ROUTE_ACCESS, [
    handler,
    controller,
  ]);
}

/** The 404 body a controller declared, or the invitations module's own. */
export function readInvitationRouteNotFound(
  reflector: Reflector,
  handler: MetadataTarget,
  controller: MetadataTarget,
): InvitationRouteNotFound {
  return (
    reflector.getAllAndOverride<InvitationRouteNotFound>(INVITATION_ROUTE_NOT_FOUND, [
      handler,
      controller,
    ]) ?? { code: "INVITATION_NOT_FOUND" }
  );
}

/** What the guard attaches to the request for the route's own decorators to read. */
export interface InvitationScopedRequest {
  params?: Record<string, string | undefined>;
  user?: { id?: unknown };
  invitationAccess?: InvitationAccessGrant;
  /** The 404 body this route's controller declared, so `@InvitationOwnerId()` answers the module's own body too. */
  invitationRouteNotFound?: InvitationRouteNotFound;
}

/**
 * The invitation access guard (L17.4). It runs after the global `AccessControlGuard`, which has already attached the
 * session's user, so it only has to answer one question: what may this caller do with the invitation the path names?
 *
 * In order: a route without an `:id` parameter is not invitation-scoped and passes (the `/invitations` list and the
 * creation route are the caller's own); a malformed id passes too, so the route's own `ParseUUIDPipe` answers the 400 it
 * always answered, or the use case its 404; a caller with no access answers the module's 404; a declared permission the
 * caller does not hold answers 403. Every invitation-scoped answer — the admitted one included — is marked
 * `Cache-Control: no-store`, so no proxy or browser can keep a collaborator's read after a revoke. Nothing is cached,
 * so a revoke takes effect on the very next request.
 */
@Injectable()
export class InvitationAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(INVITATION_ACCESS_RESOLVER) private readonly resolver: InvitationAccessResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<InvitationScopedRequest>();
    const invitationId = request.params?.id;
    const handler = context.getHandler();
    const controller = context.getClass();

    if (invitationId === undefined) {
      return true;
    }
    // The route's own 404 body, resolved once: the refusal below and `@InvitationOwnerId()` both answer it.
    const notFoundBody = readInvitationRouteNotFound(this.reflector, handler, controller);
    request.invitationRouteNotFound = notFoundBody;
    // Every invitation-scoped answer is uncacheable, whether the guard admits the caller or refuses it: what one caller
    // may read at one instant is not something a proxy or a browser may keep (L17.4).
    setNotStored(context);

    if (!isInvitationRowId(invitationId)) {
      // A route that declared its `:id` as a uuid answers the 400 it always answered; one that did not (the album's
      // moderation routes, whose ids its use case validates) passes through to its own 404.
      if (
        this.reflector.getAllAndOverride<boolean>(INVITATION_ROUTE_UUID_ID, [handler, controller])
      ) {
        throw new BadRequestException("Validation failed (uuid is expected)");
      }
      return true;
    }

    const declared = readInvitationRouteAccess(this.reflector, handler, controller) ?? OWNER_ONLY;
    const userId = request.user?.id;
    if (typeof userId !== "string" || userId === "") {
      // Fail closed: the global guard answers 401 before this one for a non-public route, so this only covers a route
      // that lost that guard, and it never lets an unidentified caller through.
      throw new UnauthorizedException();
    }

    const access = await this.resolver.resolve(userId, invitationId);
    if (access === null) {
      // The module's own 404 body, and never cached: a refusal is about one caller and one instant, and a revoke or a
      // shared invitation must not be remembered by a proxy or a browser (the CSV route's own `no-store` included).
      setNotStored(context);
      throw new NotFoundException({ ...notFoundBody });
    }

    if (
      access.role !== "OWNER" &&
      !declared.anyOf.some((permission) =>
        grantsInvitationPermission(access.permissions, permission),
      )
    ) {
      setNotStored(context);
      throw new ForbiddenException({ code: "INVITATION_FORBIDDEN" });
    }

    request.invitationAccess = access;

    return true;
  }
}

/** Marks the refusal as uncacheable, when the adapter under the guard can carry a header. */
function setNotStored(context: ExecutionContext): void {
  const response = context
    .switchToHttp()
    .getResponse<{ setHeader?: (name: string, value: string) => void }>();
  response.setHeader?.("Cache-Control", "no-store");
}
