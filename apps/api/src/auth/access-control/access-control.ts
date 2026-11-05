import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";

import { type AccountAccess, isActive, USER_ROLE } from "../account-access";

const PUBLIC_ROUTE = Symbol("invitame:public-route");
const ADMIN_ONLY = Symbol("invitame:admin-only");

/**
 * Metadata keys of `@thallesp/nestjs-better-auth` 2.8.0 (`dist/index.mjs`, `AllowAnonymous` to
 * `MemberHasPermission`). This guard implements none of them, so a route that carries one is
 * refused: `@AllowAnonymous()` would otherwise look public and `@Roles()` would look restricted.
 */
const UNSUPPORTED_INTEGRATION_KEYS = [
  "PUBLIC",
  "OPTIONAL",
  "ROLES",
  "ORG_ROLES",
  "REQUIRE_ACTIVE_ORG",
  "USER_HAS_PERMISSION",
  "MEMBER_HAS_PERMISSION",
] as const;

type MarkerTarget = Parameters<Reflector["getAllAndOverride"]>[1][number];

/** The first unsupported integration marker on a handler or its controller, if any. */
export function findUnsupportedMarker(
  reflector: Reflector,
  handler: MarkerTarget,
  controller: MarkerTarget,
): string | undefined {
  return UNSUPPORTED_INTEGRATION_KEYS.find(
    (key) => reflector.getAllAndOverride(key, [handler, controller]) !== undefined,
  );
}

/** The refusal for a marked route, at startup and per request. */
export function unsupportedMarkerMessage(route: string, marker: string): string {
  return `${route} uses the unsupported integration marker ${marker}; use @Public() or @AdminOnly().`;
}

/** Marks a route or controller as public: the guard lets it through without reading any session. */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** Restricts a route or controller to users whose stored role is `ADMIN` (ADR 0004 decision 6). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  session?: unknown;
  user?: unknown;
}

/**
 * The global guard (ADR 0004 decision 6). It replaces the integration's guard, which reads the
 * session before it honors `@AllowAnonymous()` (L20), so public routes failed when the session
 * store did. In order:
 * 1. A route marked with an integration decorator is refused as a programming error (500).
 *    `RouteMarkerCheck` already refuses such an app at startup; this per-request check stays as
 *    defense in depth for metadata the startup scan cannot see, at the cost of a few lookups.
 * 2. A `@Public()` route passes without any session lookup.
 * 3. Every other route needs a session whose stored user is ACTIVE, otherwise 401. Better Auth
 *    reads the session and user from the database on every call: its cookie cache is pinned off.
 * 4. An `@AdminOnly()` route also needs the stored role `ADMIN`, otherwise 403.
 * The session is attached to the request as the integration does, for `@Session()`.
 */
@Injectable()
export class AccessControlGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const marker = findUnsupportedMarker(this.reflector, context.getHandler(), context.getClass());

    if (marker) {
      throw new Error(unsupportedMarkerMessage("Route", marker));
    }

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true },
    });
    const user = session?.user as AccountAccess | undefined;

    if (!session || !user || !isActive(user)) {
      throw new UnauthorizedException();
    }

    request.session = session;
    request.user = session.user;

    if (
      this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) &&
      user.role !== USER_ROLE.ADMIN
    ) {
      throw new ForbiddenException();
    }

    return true;
  }
}
