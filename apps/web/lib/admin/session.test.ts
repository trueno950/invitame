import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError, type SessionResult } from "../server/api-client.ts";
import type { AuthSessionUser } from "../server/auth-session.ts";
import { type AdminPage, loadAdminView, routeAdminPage, type SessionKind } from "./session.ts";

// Server-side routing of the administrator pages (M2 T8d; S6, S21, S36). The pages read the session
// with `get-session`, because a pending administrator cannot read `/me` (ADR 0004 decision 3); the
// API stays the guard, and these rules only choose which page a visitor sees.

const ADMIN: AuthSessionUser = {
  email: "admin@example.test",
  role: "ADMIN",
  twoFactorEnabled: true,
};
const PENDING: AuthSessionUser = { ...ADMIN, twoFactorEnabled: false };
const CUSTOMER: AuthSessionUser = {
  email: "ana@example.test",
  role: "CUSTOMER",
  twoFactorEnabled: false,
};

function read(result: SessionResult<AuthSessionUser>) {
  return async () => result;
}

describe("loadAdminView", () => {
  it("tells anonymous, customer, pending, and enrolled sessions apart", async () => {
    assert.deepEqual(await loadAdminView(read({ signedIn: false })), { kind: "anonymous" });
    assert.deepEqual(await loadAdminView(read({ signedIn: true, value: CUSTOMER })), {
      kind: "customer",
    });
    assert.deepEqual(await loadAdminView(read({ signedIn: true, value: PENDING })), {
      kind: "pending-administrator",
    });
    assert.deepEqual(await loadAdminView(read({ signedIn: true, value: ADMIN })), {
      kind: "administrator",
      email: "admin@example.test",
    });
  });

  it("treats a customer with twoFactorEnabled as a customer", async () => {
    const view = await loadAdminView(
      read({ signedIn: true, value: { ...CUSTOMER, twoFactorEnabled: true } }),
    );
    assert.deepEqual(view, { kind: "customer" });
  });

  it("reports a failed read as unavailable", async () => {
    const view = await loadAdminView(async () => {
      throw new ApiClientError("unavailable", 503);
    });
    assert.deepEqual(view, { kind: "unavailable" });
  });

  it("reports a failed proxy call as unavailable and keeps its cause out of the view", async () => {
    const cause = new TypeError(
      "fetch failed for admin@example.test; better-auth.session_token=abc",
    );
    const view = await loadAdminView(async () => {
      throw new ApiClientError("unavailable", undefined, { cause });
    });
    assert.deepEqual(view, { kind: "unavailable" });
    assert.ok(!JSON.stringify(view).includes("admin@example.test"));
  });
});

describe("routeAdminPage", () => {
  const expected: Record<AdminPage, Record<SessionKind, string | null>> = {
    panel: {
      anonymous: "/admin/ingresar",
      customer: "/cuenta",
      "pending-administrator": "/admin/activar",
      administrator: null,
      unavailable: null,
    },
    "sign-in": {
      anonymous: null,
      customer: "/cuenta",
      "pending-administrator": "/admin/activar",
      administrator: "/admin",
      unavailable: null,
    },
    enrollment: {
      anonymous: "/admin/ingresar",
      customer: "/cuenta",
      "pending-administrator": null,
      administrator: "/admin",
      unavailable: null,
    },
    catalog: {
      anonymous: "/admin/ingresar",
      customer: "/cuenta",
      "pending-administrator": "/admin/activar",
      administrator: null,
      unavailable: null,
    },
    payments: {
      anonymous: "/admin/ingresar",
      customer: "/cuenta",
      "pending-administrator": "/admin/activar",
      administrator: null,
      unavailable: null,
    },
    invitations: {
      anonymous: "/admin/ingresar",
      customer: "/cuenta",
      "pending-administrator": "/admin/activar",
      administrator: null,
      unavailable: null,
    },
  };

  for (const [page, byKind] of Object.entries(expected)) {
    for (const [kind, target] of Object.entries(byKind)) {
      it(`${page} for ${kind}: ${target ?? "renders"}`, () => {
        assert.equal(routeAdminPage(page as AdminPage, kind as SessionKind), target);
      });
    }
  }
});
