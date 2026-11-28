import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INVITATION_ACCESS_COOKIE,
  INVITATION_ACCESS_COOKIE_MAX_AGE_SECONDS,
  invitationAccessCookie,
  invitationAccessTokenOf,
  isInvitationAccessToken,
} from "./invitation-access-cookie.ts";

// The cookie the web stores when a guest opens a password-protected invitation (F13; S2.13, L18.2). It is the only
// place the access token lives on the web: `HttpOnly`, `Secure` over https, `SameSite=Lax`, path-scoped to the one
// invitation's page, and 30 days — the token's own lifetime. These tests drive the builder, not a browser.

/** A token of the shape the API mints: prefix, version, expiry, and the 43 base64url characters of an HMAC-SHA256. */
const TOKEN = `invaccess1.3.1893456000.${"a".repeat(43)}`;

describe("the invitation access cookie (F13; L18.2)", () => {
  it("scopes an HttpOnly, Lax cookie to the one invitation's page for 30 days", () => {
    assert.deepEqual(invitationAccessCookie("ana-y-luis", TOKEN, true), {
      name: INVITATION_ACCESS_COOKIE,
      value: TOKEN,
      httpOnly: true,
      sameSite: "lax",
      path: "/i/ana-y-luis",
      maxAge: INVITATION_ACCESS_COOKIE_MAX_AGE_SECONDS,
      secure: true,
    });
    assert.equal(INVITATION_ACCESS_COOKIE_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
  });

  it("leaves the cookie unsecure over plain http, so a local deployment keeps working", () => {
    assert.equal(invitationAccessCookie("ana-y-luis", TOKEN, false).secure, false);
  });

  it("keeps the token out of the cookie's name and out of any other path", () => {
    const cookie = invitationAccessCookie("ana-y-luis", TOKEN, true);

    assert.equal(cookie.name.includes(TOKEN), false);
    assert.equal(cookie.path, "/i/ana-y-luis");
  });
});

describe("the shape of one access token (F13; L18.2)", () => {
  it("accepts a token the API could have minted", () => {
    assert.equal(isInvitationAccessToken(TOKEN), true);
  });

  it("refuses anything else: another prefix, an empty mac, a padded mac, a non-numeric field, a longer value", () => {
    for (const value of [
      "",
      "invaccess1",
      `invaccess2.3.1893456000.${"a".repeat(43)}`,
      `invaccess1.x.1893456000.${"a".repeat(43)}`,
      `invaccess1.3.1893456000.${"a".repeat(42)}`,
      `invaccess1.3.1893456000.${"a".repeat(44)}`,
      `invaccess1.3.1893456000.${"a".repeat(42)}=`,
      `invaccess1.3.1893456000.${"a".repeat(42)}+`,
      `invaccess1.3.1893456000.${"a".repeat(43)}.extra`,
      `invaccess1.-1.1893456000.${"a".repeat(43)}`,
      43,
      null,
      undefined,
    ]) {
      assert.equal(isInvitationAccessToken(value), false, JSON.stringify(value));
    }
  });
});

describe("the token a public page forwards (F13; L18.2)", () => {
  it("reads the value of the cookie it stored", () => {
    assert.equal(invitationAccessTokenOf(TOKEN), TOKEN);
  });

  it("forwards nothing for a missing, blank, or foreign value", () => {
    for (const value of [undefined, "", "   ", "invitame-otra-cosa", `${TOKEN} `]) {
      assert.equal(invitationAccessTokenOf(value), undefined, JSON.stringify(value));
    }
  });
});
