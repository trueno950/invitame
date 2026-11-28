import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { lockNotice, lockScreenView } from "../../../../lib/public/invitation-lock.ts";
import { lockWriteNotice } from "../../../../lib/public/invitation-lock-write.ts";
import { InvitationLockScreen } from "./lock-screen.ts";

// The English lock screen (F14; S2.14, L19.2): an invitation that stores an access code asks for it in the language the
// page renders, and the two refusals keep their own sentence, never saying which of them happened. The codes the
// actions redirect with never change; only the sentence the screen draws does (L19.2).

const SLUG = "ana-y-luis";
const action = async (): Promise<void> => {};

function render(input: {
  displayName: string | null;
  parameters?: Record<string, string | string[] | undefined>;
}): string {
  const notice =
    lockNotice(input.parameters ?? {}, "en") ?? lockWriteNotice(input.parameters ?? {}, "en");
  const view = lockScreenView({
    slug: SLUG,
    displayName: input.displayName,
    locale: "en",
    ...(notice === undefined ? {} : { notice }),
  });

  assert.ok(view !== undefined);

  return renderToStaticMarkup(createElement(InvitationLockScreen, { view, action }));
}

describe("the guest's lock screen in English (F14; L19.2)", () => {
  it("asks for the password in English and names the celebration it unlocks", () => {
    const html = render({ displayName: "Ana y Luis" });

    assert.match(html, /Ana y Luis/);
    assert.match(html, /This invitation is private\. Enter the password you were given\./);
    assert.match(html, />Password</);
    assert.match(html, />View invitation</);
    assert.match(html, /Don&#x27;t have it\? Ask whoever invited you\./);
    assert.doesNotMatch(html, /Esta invitación es privada/);
    assert.doesNotMatch(html, /Ver invitación/);
  });

  it("keeps the generic line of a locked invitation that names nobody", () => {
    const html = render({ displayName: null });

    assert.match(html, /Private invitation/);
    assert.doesNotMatch(html, /Invitación privada/);
  });

  it("shows the English refusal of a wrong code and of an exhausted budget", () => {
    const rejected = render({ displayName: "Ana y Luis", parameters: { acceso: "rejected" } });
    const limited = render({ displayName: "Ana y Luis", parameters: { acceso: "limited" } });

    assert.match(rejected, /That password isn&#x27;t right\./);
    assert.match(limited, /Too many attempts\. Wait a few minutes\./);
    assert.doesNotMatch(rejected, /Esa contraseña no es correcta/);
  });

  it("shows the English sentence of a public write the access code refused, with its code unchanged", () => {
    const parameters = { rsvp: "locked" };
    const notice = lockWriteNotice(parameters);

    assert.deepEqual(notice?.code, "locked");
    assert.match(render({ displayName: "Ana y Luis", parameters }), /asks for a password/);
  });
});
