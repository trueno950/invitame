import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  InvitationResult,
  OwnedInvitation,
  PasswordState,
} from "../server/invitations-api.ts";
import {
  INVITATION_PASSWORD_MAX_LENGTH,
  INVITATION_PASSWORD_MIN_LENGTH,
  PASSWORD_PROTECTION_FEATURE_KEY,
  type PasswordActionsApi,
  parseInvitationPassword,
  passwordProtectionView,
  passwordShareMessage,
  removeInvitationPassword,
  saveInvitationPassword,
} from "./password-protection.ts";

// The owner's «Pedir contraseña» block of the «Publicar» tab (F13; S2.13, L18.1, L18.5). The API owns the hash, the
// gate, and the version; this module owns the local rules a form can get wrong, the state the block renders, and the
// ready-to-share message the owner reads once. These tests drive it through that public surface only.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const SLUG = "ana-y-luis";
const TARGET = `/cuenta/invitaciones/${ID}`;

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

/** The invitation the command reads back after a save, as the API answers it (only the fields it reads). */
const OWNED = { slug: SLUG } as OwnedInvitation;

function apiOf(answers: {
  setPassword?: (id: string, password: string) => Promise<InvitationResult<PasswordState>>;
  clearPassword?: (id: string) => Promise<InvitationResult<PasswordState>>;
  get?: (id: string) => Promise<InvitationResult<OwnedInvitation>>;
}): PasswordActionsApi {
  return {
    setPassword:
      answers.setPassword ??
      (() => Promise.resolve({ ok: true, value: { passwordProtected: true } })),
    clearPassword:
      answers.clearPassword ??
      (() => Promise.resolve({ ok: true, value: { passwordProtected: false } })),
    get: answers.get ?? (() => Promise.resolve({ ok: true, value: OWNED })),
  };
}

describe("the access code an owner types (F13; L18.1)", () => {
  it("accepts a code of 4 to 40 characters and trims the surrounding spaces", () => {
    assert.deepEqual(parseInvitationPassword("  rosas2026  "), {
      ok: true,
      password: "rosas2026",
    });
    assert.deepEqual(parseInvitationPassword("a".repeat(INVITATION_PASSWORD_MIN_LENGTH)), {
      ok: true,
      password: "aaaa",
    });
    assert.deepEqual(parseInvitationPassword("b".repeat(INVITATION_PASSWORD_MAX_LENGTH)), {
      ok: true,
      password: "b".repeat(40),
    });
    assert.equal(INVITATION_PASSWORD_MIN_LENGTH, 4);
    assert.equal(INVITATION_PASSWORD_MAX_LENGTH, 40);
  });

  it("refuses a code the API would refuse: too short, too long, a control character, or no text at all", () => {
    assert.deepEqual(parseInvitationPassword("tres"), { ok: true, password: "tres" });
    assert.deepEqual(parseInvitationPassword("abc"), { ok: false, failure: "too-short" });
    assert.deepEqual(parseInvitationPassword(""), { ok: false, failure: "too-short" });
    assert.deepEqual(parseInvitationPassword("   "), { ok: false, failure: "too-short" });
    assert.deepEqual(parseInvitationPassword("c".repeat(41)), { ok: false, failure: "too-long" });
    assert.deepEqual(parseInvitationPassword("rosa\u0000s2026"), { ok: false, failure: "control" });
    assert.deepEqual(parseInvitationPassword("rosa\u007fs2026"), { ok: false, failure: "control" });
    assert.deepEqual(parseInvitationPassword(42), { ok: false, failure: "missing" });
    assert.deepEqual(parseInvitationPassword(undefined), { ok: false, failure: "missing" });
  });

  it("keeps whitespace inside a code as typed, so a two-word code stays one code", () => {
    assert.deepEqual(parseInvitationPassword("ana y luis"), { ok: true, password: "ana y luis" });
  });
});

describe("what the «Pedir contraseña» block shows (F13; L18.5)", () => {
  it("is offered only to a package that grants PASSWORD_PROTECTION", () => {
    assert.deepEqual(
      passwordProtectionView({
        availableFeatures: ["COUNTDOWN", PASSWORD_PROTECTION_FEATURE_KEY, "CALENDAR"],
        passwordProtected: false,
      }),
      { show: true, protected: false },
    );
    assert.deepEqual(
      passwordProtectionView({ availableFeatures: ["COUNTDOWN"], passwordProtected: false }),
      { show: false, protected: false },
    );
  });

  it("keeps a stored code visible to its owner even after the package withdrew the key, so it can be removed", () => {
    assert.deepEqual(passwordProtectionView({ availableFeatures: [], passwordProtected: true }), {
      show: false,
      protected: true,
    });
  });
});

describe("the ready-to-share message (F13; L18.1)", () => {
  it("puts the public link and the code the owner just typed in one line", () => {
    assert.equal(
      passwordShareMessage("https://invitame.mx/i/ana-y-luis", "rosas2026"),
      "Te invitamos: https://invitame.mx/i/ana-y-luis · contraseña: rosas2026",
    );
  });
});

describe("saving the code from the block (F13; L18.1)", () => {
  it("stores the code and answers the one-time message with the typed value", async () => {
    const asked: unknown[] = [];
    const outcome = await saveInvitationPassword(
      apiOf({
        setPassword: (id, password) => {
          asked.push([id, password]);
          return Promise.resolve({ ok: true, value: { passwordProtected: true } });
        },
      }),
      formOf({ id: ID, password: "  rosas2026  " }),
      { origin: "https://invitame.mx" },
    );

    assert.deepEqual(asked, [[ID, "rosas2026"]]);
    assert.deepEqual(outcome, {
      kind: "saved",
      target: TARGET,
      message: "Te invitamos: https://invitame.mx/i/ana-y-luis · contraseña: rosas2026",
    });
  });

  it("keeps the typed code out of the URL it comes back to", async () => {
    const outcome = await saveInvitationPassword(
      apiOf({}),
      formOf({ id: ID, password: "rosas2026" }),
      { origin: "https://invitame.mx" },
    );

    assert.equal(outcome.kind, "saved");
    assert.equal(outcome.target.includes("rosas2026"), false);
    assert.equal(outcome.kind === "saved" && outcome.message?.includes("?") === true, false);
  });

  it("refuses a code the domain would refuse without sending it anywhere", async () => {
    let calls = 0;
    const outcome = await saveInvitationPassword(
      apiOf({
        setPassword: () => {
          calls += 1;
          return Promise.resolve({ ok: true, value: { passwordProtected: true } });
        },
      }),
      formOf({ id: ID, password: "abc" }),
      { origin: undefined },
    );

    assert.equal(calls, 0);
    assert.deepEqual(outcome, { kind: "refused", target: `${TARGET}?error=password-invalid` });
  });

  it("comes back to the invitation when the package does not grant the capability", async () => {
    const outcome = await saveInvitationPassword(
      apiOf({
        setPassword: () =>
          Promise.resolve({ ok: false, failure: "password-protection-unavailable" }),
      }),
      formOf({ id: ID, password: "rosas2026" }),
      { origin: undefined },
    );

    assert.deepEqual(outcome, {
      kind: "refused",
      target: `${TARGET}?error=password-protection-unavailable`,
    });
  });

  it("sends the owner to sign in, and an id that cannot be one to the list, without a write", async () => {
    assert.deepEqual(
      await saveInvitationPassword(
        apiOf({ setPassword: () => Promise.resolve({ ok: false, failure: "signed-out" }) }),
        formOf({ id: ID, password: "rosas2026" }),
        { origin: undefined },
      ),
      { kind: "refused", target: "/ingresar" },
    );
    assert.deepEqual(
      await saveInvitationPassword(apiOf({}), formOf({ password: "rosas2026" }), {
        origin: undefined,
      }),
      { kind: "refused", target: "/cuenta/invitaciones?error=not-found" },
    );
  });
});

describe("removing the code from the block (F13; L18.1)", () => {
  it("removes it and confirms it on the invitation", async () => {
    assert.deepEqual(await removeInvitationPassword(apiOf({}), formOf({ id: ID })), {
      kind: "removed",
      target: `${TARGET}?notice=password-removed`,
    });
  });

  it("comes back with the refusal the API answered", async () => {
    assert.deepEqual(
      await removeInvitationPassword(
        apiOf({ clearPassword: () => Promise.resolve({ ok: false, failure: "not-editable" }) }),
        formOf({ id: ID }),
      ),
      { kind: "refused", target: `${TARGET}?error=not-editable` },
    );
    assert.deepEqual(await removeInvitationPassword(apiOf({}), formOf({})), {
      kind: "refused",
      target: "/cuenta/invitaciones?error=not-found",
    });
  });
});
