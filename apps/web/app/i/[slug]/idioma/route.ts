import { headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  languageChoiceOutcome,
  languageChoiceParameters,
} from "../../../../lib/i18n/guest-locale.ts";
import { requestOrigin } from "../../../../lib/server/request-origin.ts";

/**
 * `GET /i/[slug]/idioma?idioma=en` (F14; S2.14, L19.2, L19.3): the one request that remembers a guest's language
 * choice. The ES / EN switch links here with no client script, this handler stores the choice in the
 * `invitame-idioma` cookie — scoped to that invitation's own page, `SameSite=Lax`, one year — and answers a redirect
 * to the clean URL, so the guest never stays on a page whose address carries a language query.
 *
 * It is a route handler and not a page because only a route handler or a server action may set a cookie. The whole
 * decision is `languageChoiceOutcome`, which the tests prove: a value that is not one of the two locales sets nothing
 * and still returns to the clean page, the personal token of `/i/<slug>/g/<token>` is only followed when this
 * deployment could have minted it, and a slug that cannot be one answers the plain 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  // `getAll` and not `get`: a repeated `idioma` names no single language, exactly like the page's own decision, so a
  // hand-edited link never chooses for the guest (L19.3).
  const search = new URL(request.url).searchParams;
  const outcome = languageChoiceOutcome({
    slug,
    parameters: languageChoiceParameters(search),
    secure: requestOrigin(await headers())?.startsWith("https://") ?? false,
  });

  if (outcome === undefined) {
    return new NextResponse(null, { status: 404 });
  }

  const answer = new NextResponse(null, {
    status: 303,
    headers: { location: outcome.target, "cache-control": "no-store" },
  });

  if (outcome.ok) {
    answer.cookies.set(outcome.cookie);
  }
  return answer;
}
