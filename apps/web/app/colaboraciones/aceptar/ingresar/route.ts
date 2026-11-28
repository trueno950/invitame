import { headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  COLLABORATION_PATHS,
  collaborationAcceptPath,
  isCollaborationToken,
} from "../../../../lib/customer/collaboration.ts";
import { requestOrigin } from "../../../../lib/server/request-origin.ts";
import { afterSignIn, afterSignInCookie } from "../../../../lib/server/single-use-flash.ts";

/**
 * `GET /colaboraciones/aceptar/ingresar?token=…` (F12; L17.3): the way back from sign-in. A visitor who opened the
 * emailed link without a session is sent here, this handler remembers the bare acceptance path in the one-time store,
 * and it answers a cookie only an opaque handle in — `httpOnly`, `SameSite=Strict`, scoped to `/cuenta`, short-lived.
 * `/cuenta` reads that handle once, after the visitor is signed in, and sends them back to the acceptance.
 *
 * It is a route handler and not a page because only a route handler or a server action may set a cookie. The stored value
 * is a path this module builds and validates again when it is read, so the return can never leave the acceptance page,
 * and a token that cannot have been minted is refused here instead of being stored.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");

  if (!isCollaborationToken(token)) {
    return new NextResponse(null, {
      status: 303,
      headers: { location: COLLABORATION_PATHS.accept },
    });
  }

  const handle = afterSignIn.put(collaborationAcceptPath(token));
  const secure = requestOrigin(await headers())?.startsWith("https://") ?? false;
  const answer = new NextResponse(null, { status: 303, headers: { location: "/ingresar" } });

  answer.cookies.set(afterSignInCookie(handle, secure));
  return answer;
}
