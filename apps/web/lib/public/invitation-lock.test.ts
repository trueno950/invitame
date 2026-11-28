import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOCK_SCREEN_COPY } from "../customer/copy.ts";
import {
  INVITATION_LOCK_CODE,
  LOCK_NOTICE_CODES,
  LOCK_NOTICE_PARAM,
  type LockScreenView,
  lockNotice,
  lockNoticeTarget,
  lockScreenView,
  lockedRedirectSlug,
  parseInvitationLockedBody,
  parseUnlockForm,
  unlockInvitationWith,
} from "./invitation-lock.ts";
import { lockWriteNotice } from "./invitation-lock-write.ts";

// The lock screen of a password-protected invitation (F13; S2.13, L18.1, L18.2, L18.3). The API owns the gate and the
// rate limit; this module only decides what the locked answer carries, which of the two neutral sentences the page
// shows after a refused attempt, what the submitted form becomes, and what the screen draws.

const SLUG = "ana-y-luis";

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

describe("the locked answer of a public read (F13; L18.2, L18.3)", () => {
  it("carries the lock state and the one display name, and nothing else", () => {
    assert.deepEqual(
      parseInvitationLockedBody({ code: "INVITATION_LOCKED", displayName: "Ana y Luis" }),
      { displayName: "Ana y Luis", redirectTo: null },
    );
    // An invitation whose content names nobody still locks, and the screen shows its generic line.
    assert.deepEqual(parseInvitationLockedBody({ code: "INVITATION_LOCKED", displayName: null }), {
      displayName: null,
      redirectTo: null,
    });
  });

  it("keeps only the display name out of a body that grew more fields", () => {
    const parsed = parseInvitationLockedBody({
      code: "INVITATION_LOCKED",
      displayName: "Ana",
      date: "2026-12-05",
      slug: SLUG,
    });

    assert.deepEqual(parsed, { displayName: "Ana", redirectTo: null });
  });

  it("refuses a body that is not a locked answer: another code, no display name, a non-text name", () => {
    for (const value of [
      undefined,
      null,
      {},
      { code: "INVITATION_PASSWORD_REJECTED" },
      { code: "INVITATION_LOCKED" },
      { code: "INVITATION_LOCKED", displayName: 42 },
      { code: "INVITATION_LOCKED", displayName: "x".repeat(81) },
      [INVITATION_LOCK_CODE],
    ]) {
      assert.equal(parseInvitationLockedBody(value), undefined, JSON.stringify(value));
    }
  });

  it("names the lock code the API answers with", () => {
    assert.equal(INVITATION_LOCK_CODE, "INVITATION_LOCKED");
  });
});

// A locked guest may have arrived through an address the invitation no longer holds (F13; L18.2). The answer carries the
// current one, and the page moves there before drawing the lock screen, so the cookie the guest sets for it lives at the
// address the invitation is served from.
describe("the current address of a locked invitation (F13; L18.2)", () => {
  it("reads the address a previous link must move to before the lock screen", () => {
    assert.deepEqual(
      parseInvitationLockedBody({
        code: "INVITATION_LOCKED",
        displayName: "Ana y Luis",
        redirectTo: "valentina-xv",
      }),
      { displayName: "Ana y Luis", redirectTo: "valentina-xv" },
    );
    assert.deepEqual(
      parseInvitationLockedBody({ code: "INVITATION_LOCKED", displayName: null, redirectTo: null }),
      { displayName: null, redirectTo: null },
    );
  });

  it("reads an absent field as no redirect, for an API written before it (L20)", () => {
    assert.deepEqual(parseInvitationLockedBody({ code: "INVITATION_LOCKED", displayName: null }), {
      displayName: null,
      redirectTo: null,
    });
  });

  it("refuses a redirect target that is not a slug", () => {
    for (const redirectTo of [7, true, "", "Ana y Luis", "ana/y", "x".repeat(61), [], {}]) {
      assert.equal(
        parseInvitationLockedBody({ code: "INVITATION_LOCKED", displayName: null, redirectTo }),
        undefined,
        JSON.stringify(redirectTo),
      );
    }
  });

  it("moves the locked page to another address of the same shape, and never to the one it is drawn at", () => {
    assert.equal(lockedRedirectSlug(SLUG, "valentina-xv"), "valentina-xv");
    // The address the guest asked for is where the lock screen is drawn: moving to it would loop.
    assert.equal(lockedRedirectSlug(SLUG, SLUG), undefined);
    assert.equal(lockedRedirectSlug(SLUG, null), undefined);
    for (const value of ["Ana y Luis", "", "a-", "x".repeat(61)]) {
      assert.equal(lockedRedirectSlug(SLUG, value), undefined, value);
    }
  });
});

describe("the notice of a refused unlock (F13; L18.3)", () => {
  it("says one neutral sentence for a refused code and another for an exhausted budget", () => {
    assert.deepEqual(lockNotice({ [LOCK_NOTICE_PARAM]: "rejected" }), {
      code: "rejected",
      message: LOCK_SCREEN_COPY.rejected,
    });
    assert.deepEqual(lockNotice({ [LOCK_NOTICE_PARAM]: "limited" }), {
      code: "limited",
      message: LOCK_SCREEN_COPY.limited,
    });
    assert.equal(LOCK_SCREEN_COPY.rejected, "Esa contraseña no es correcta.");
    assert.equal(LOCK_SCREEN_COPY.limited, "Demasiados intentos. Espera unos minutos.");
  });

  it("shows nothing for a page nobody refused, and nothing for a code the page does not know", () => {
    for (const parameters of [{}, { acceso: "other" }, { acceso: ["rejected"] }, { acceso: "" }]) {
      assert.equal(lockNotice(parameters), undefined, JSON.stringify(parameters));
    }
  });

  // A public write refused because the invitation is locked (F13; L18.2): the action comes back to the invitation page,
  // which draws its lock screen with this one sentence instead of the write's generic failure notice.
  it("says the invitation asks for its password, on every write's own query", () => {
    for (const parameters of [{ rsvp: "locked" }, { firma: "locked" }, { foto: "locked" }]) {
      assert.deepEqual(
        lockWriteNotice(parameters),
        {
          code: "locked",
          message: "Esta invitación pide contraseña. Vuelve a abrirla para escribirla.",
        },
        JSON.stringify(parameters),
      );
    }
    assert.equal(
      LOCK_SCREEN_COPY.writeRefused,
      "Esta invitación pide contraseña. Vuelve a abrirla para escribirla.",
    );
  });

  it("shows nothing when no write was refused, and nothing for a value it does not know", () => {
    for (const parameters of [
      {},
      { rsvp: "received" },
      { rsvp: ["locked"] },
      { acceso: "locked" },
    ]) {
      assert.equal(lockWriteNotice(parameters), undefined, JSON.stringify(parameters));
    }
  });

  it("carries the two codes and nowhere else, in the page's own query", () => {
    assert.deepEqual([...LOCK_NOTICE_CODES], ["rejected", "limited"]);
    assert.equal(lockNoticeTarget(SLUG, "rejected"), `/i/${SLUG}?acceso=rejected`);
    assert.equal(lockNoticeTarget(SLUG, "limited"), `/i/${SLUG}?acceso=limited`);
  });
});

describe("the form a guest's lock screen posts (F13; L18.1)", () => {
  it("reads the slug and the code the guest typed", () => {
    assert.deepEqual(parseUnlockForm(formOf({ slug: SLUG, password: "rosas2026" })), {
      ok: true,
      slug: SLUG,
      password: "rosas2026",
    });
  });

  it("trims the surrounding spaces of a code copied out of a message", () => {
    const parsed = parseUnlockForm(formOf({ slug: SLUG, password: "  rosas2026  " }));

    assert.deepEqual(parsed, { ok: true, slug: SLUG, password: "rosas2026" });
  });

  it("refuses a form without a slug, without a code, or with a code no invitation could have", () => {
    for (const values of [
      { password: "rosas2026" },
      { slug: "Ana y Luis", password: "rosas2026" },
      { slug: SLUG },
      { slug: SLUG, password: "   " },
      { slug: SLUG, password: "x".repeat(41) },
    ]) {
      assert.equal(parseUnlockForm(formOf(values)).ok, false, JSON.stringify(values));
    }
  });
});

describe("what the lock screen draws (F13; L18.1)", () => {
  it("names the celebration the locked answer carried, with the artboard's four lines", () => {
    const view = lockScreenView({ slug: SLUG, displayName: "Ana y Luis" });

    assert.ok(view !== undefined);
    assert.deepEqual(view, {
      slug: SLUG,
      subject: "Ana y Luis",
      privateLine: "Esta invitación es privada. Escribe la contraseña que te compartieron.",
      fieldLabel: "Contraseña",
      submit: "Ver invitación",
      hint: "¿No la tienes? Pídesela a quien te invitó.",
    });
  });

  it("shows its generic line when the invitation names nobody", () => {
    const view = lockScreenView({ slug: SLUG, displayName: null });

    assert.equal(view?.subject, LOCK_SCREEN_COPY.privateTitle);
    assert.equal(view?.subject, "Invitación privada");
  });

  it("adds the one sentence of a refused attempt, and nothing else", () => {
    const view: LockScreenView | undefined = lockScreenView({
      slug: SLUG,
      displayName: "Ana y Luis",
      notice: { code: "limited", message: LOCK_SCREEN_COPY.limited },
    });

    assert.deepEqual(view?.notice, { code: "limited", message: LOCK_SCREEN_COPY.limited });
  });

  it("draws nothing for a slug that cannot be one", () => {
    assert.equal(lockScreenView({ slug: "Ana y Luis", displayName: "Ana" }), undefined);
  });
});

describe("one unlock attempt through the server action (F13; L18.2, L18.3)", () => {
  const request = { clientAddress: "203.0.113.7" };

  it("answers the token and the invitation it opens when the code was accepted", async () => {
    const asked: unknown[] = [];
    const outcome = await unlockInvitationWith(
      {
        unlock: (slug, password, options) => {
          asked.push([slug, password, options]);
          return Promise.resolve({
            ok: true as const,
            accessToken: `invaccess1.1.1893456000.${"b".repeat(43)}`,
            expiresAt: "2027-01-01T00:00:00.000Z",
          });
        },
      },
      formOf({ slug: SLUG, password: "rosas2026" }),
      request,
    );

    assert.deepEqual(asked, [[SLUG, "rosas2026", { clientAddress: "203.0.113.7" }]]);
    assert.deepEqual(outcome, {
      kind: "unlocked",
      slug: SLUG,
      accessToken: `invaccess1.1.1893456000.${"b".repeat(43)}`,
    });
  });

  it("comes back to the same lock screen with the neutral sentence of a refused code", async () => {
    const outcome = await unlockInvitationWith(
      { unlock: () => Promise.resolve({ ok: false as const, failure: "rejected" as const }) },
      formOf({ slug: SLUG, password: "otra" }),
      request,
    );

    assert.deepEqual(outcome, { kind: "refused", target: `/i/${SLUG}?acceso=rejected` });
  });

  it("comes back with the other neutral sentence when the address spent its attempts", async () => {
    const outcome = await unlockInvitationWith(
      { unlock: () => Promise.resolve({ ok: false as const, failure: "rate-limited" as const }) },
      formOf({ slug: SLUG, password: "rosas2026" }),
      request,
    );

    assert.deepEqual(outcome, { kind: "refused", target: `/i/${SLUG}?acceso=limited` });
  });

  it("answers a form it cannot read without sending a request", async () => {
    let calls = 0;
    const outcome = await unlockInvitationWith(
      {
        unlock: () => {
          calls += 1;
          return Promise.resolve({ ok: false as const, failure: "rejected" as const });
        },
      },
      formOf({ slug: SLUG, password: "" }),
      request,
    );

    assert.equal(calls, 0);
    assert.deepEqual(outcome, { kind: "invalid" });
  });
});
