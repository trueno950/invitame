import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { checkInPath } from "../../../../../../lib/public/guest-pass.ts";
import { requestOrigin } from "../../../../../../lib/server/request-origin.ts";
import { afterSignIn, afterSignInCookie } from "../../../../../../lib/server/single-use-flash.ts";

/**
 * `GET /cuenta/acceso/<slug>/<token>/ingresar` (M6 G4; S4): the way back from sign-in. A visitor who opens a guest's
 * access pass without a session is sent here, this handler remembers the bare check-in path in the one-time store,
 * and it answers a cookie only an opaque handle in — `httpOnly`, `SameSite=Strict`, scoped to `/cuenta`, short-lived.
 * `/cuenta` reads that handle once, after the visitor is signed in, and sends them back to the pass.
 *
 * It is a route handler and not a page because only a route handler or a server action may set a cookie. The stored
 * value is a path this module builds and validates again when it is read, so the return can never leave `/cuenta`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
): Promise<NextResponse> {
  const { slug, token } = await params;
  const path = checkInPath(slug, token);

  if (path === undefined) {
    return new NextResponse(null, { status: 404 });
  }

  const handle = afterSignIn.put(path);
  const secure = requestOrigin(await headers())?.startsWith("https://") ?? false;
  const answer = new NextResponse(null, { status: 303, headers: { location: "/ingresar" } });

  answer.cookies.set(afterSignInCookie(handle, secure));
  return answer;
}
