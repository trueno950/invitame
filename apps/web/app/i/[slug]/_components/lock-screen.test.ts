import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LOCK_SCREEN_COPY } from "../../../../lib/customer/copy.ts";
import { lockScreenView } from "../../../../lib/public/invitation-lock.ts";
import { InvitationLockScreen } from "./lock-screen.ts";

// The lock screen a guest reads while an invitation stores an access code (F13; S2.13, L18.1). It is a server component
// with no client script: one plain form posting to the unlock action, the four lines of the artboard
// `design/password-invitation/01-pantalla-con-candado.html` in the app's own tokens, and one neutral sentence when an
// attempt was refused. These tests render it and read the markup.

const SLUG = "ana-y-luis";
const action = async (): Promise<void> => {};

function render(properties: {
  displayName: string | null;
  notice?: { code: "rejected" | "limited" | "locked"; message: string };
}): string {
  const view = lockScreenView({ slug: SLUG, ...properties });

  assert.ok(view !== undefined);

  return renderToStaticMarkup(createElement(InvitationLockScreen, { view, action }));
}

describe("the guest's lock screen (F13; L18.1)", () => {
  it("names the celebration the locked answer carried, and says what the page needs", () => {
    const html = render({ displayName: "Ana y Luis" });

    assert.match(html, /Ana y Luis/);
    assert.match(html, /Esta invitación es privada\. Escribe la contraseña que te compartieron\./);
    assert.match(html, /Ver invitación/);
    assert.match(html, /¿No la tienes\? Pídesela a quien te invitó\./);
    assert.match(html, /Contraseña/);
  });

  it("renders one password field of the invitation's own slug: a plain form, no client script of its own", () => {
    const html = render({ displayName: "Ana y Luis" });

    assert.match(html, /<form[^>]*>/);
    assert.match(html, /<input[^>]*type="password"[^>]*name="password"/);
    assert.match(html, /<input[^>]*type="hidden"[^>]*name="slug"[^>]*value="ana-y-luis"/);
    assert.match(html, /<button[^>]*type="submit"[^>]*>/);
    // The one script React adds for a form whose action is a server function is the framework's own hand-off; the
    // screen itself ships none.
    assert.equal(html.includes("src="), false);
  });

  it("shows the artboard's generic line for an invitation whose content names nobody", () => {
    const html = render({ displayName: null });

    assert.match(html, /Invitación privada/);
    assert.equal(html.includes(LOCK_SCREEN_COPY.privateLine), true);
  });

  it("draws one neutral sentence when an attempt was refused, never the reason", () => {
    const rejected = render({
      displayName: "Ana y Luis",
      notice: { code: "rejected", message: LOCK_SCREEN_COPY.rejected },
    });
    const limited = render({
      displayName: "Ana y Luis",
      notice: { code: "limited", message: LOCK_SCREEN_COPY.limited },
    });

    assert.match(rejected, /Esa contraseña no es correcta\./);
    assert.match(limited, /Demasiados intentos\. Espera unos minutos\./);
    // A refusal is text, not a hue: the sentence is inside a live region the guest can read.
    assert.match(rejected, /role="alert"/);
  });

  it("draws no notice when nothing was refused", () => {
    const html = render({ displayName: "Ana y Luis" });

    assert.equal(html.includes('role="alert"'), false);
  });

  // A public write refused by the access code comes back to this screen (F13; L18.2): the guest reads what to do next
  // instead of the write's generic failure sentence.
  it("says the invitation asks for its password when the access code refused a write", () => {
    const html = render({
      displayName: "Ana y Luis",
      notice: { code: "locked", message: LOCK_SCREEN_COPY.writeRefused },
    });

    assert.match(html, /Esta invitación pide contraseña\. Vuelve a abrirla para escribirla\./);
    assert.match(html, /role="alert"/);
  });

  it("names the lock screen in words for a guest reading with a screen reader, and marks the lock as decoration", () => {
    const html = render({ displayName: "Ana y Luis" });

    assert.match(html, /<h1[^>]*>Ana y Luis<\/h1>/);
    assert.match(html, /aria-hidden="true"/);
    // Nothing about the invitation beyond its name reaches a locked page (L18.3).
    for (const absent of ["Ana y Luis y", "fecha", "lugar", "2026"]) {
      assert.equal(html.includes(absent), false, absent);
    }
  });
});
