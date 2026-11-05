import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";

/**
 * The id of the signed-in user, as `AccessControlGuard` attached it from the stored session. Routes
 * that own a resource read the user from here, never from the path, query, or body. Fails closed with
 * 401 when no session was attached, for example on a `@Public()` route.
 */
export const SessionUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const user = context.switchToHttp().getRequest<{ user?: unknown }>().user as
      | { id?: unknown }
      | undefined;

    if (typeof user?.id !== "string" || user.id === "") {
      throw new UnauthorizedException();
    }
    return user.id;
  },
);
