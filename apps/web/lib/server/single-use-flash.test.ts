import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AFTER_SIGN_IN_COOKIE,
  afterSignInCookie,
  createSingleUseFlash,
  FLASH_COOKIE_MAX_AGE_SECONDS,
  GUEST_LINK_COOKIE,
  guestLinkCookie,
  isFlashHandle,
  PASSWORD_SHARE_COOKIE,
  passwordShareCookie,
  passwordShares,
} from "./single-use-flash.ts";

// The one-time hand-off between a server action and the page it redirects to (M6 G4; S4). A plain cookie cannot be
// deleted while a server component renders, and the personal token of a guest must never travel in a URL, so the
// token stays in this process's memory and the browser carries only an opaque handle: read once, deleted on read,
// expiring on its own, and bounded so a burst cannot grow it without limit.

interface Entry {
  invitationId: string;
  personalUrl: string;
}

const HANDLE = /^[A-Za-z0-9_-]{22}$/;

function store(options: { ttlMs?: number; capacity?: number; now?: () => number } = {}) {
  return createSingleUseFlash<Entry>(options);
}

describe("single-use flash", () => {
  it("answers an opaque 22-character handle and the value exactly once", () => {
    const flash = store();
    const entry = { invitationId: "inv-1", personalUrl: "http://localhost:3000/i/a/g/token" };

    const handle = flash.put(entry);

    assert.match(handle, HANDLE);
    assert.equal(isFlashHandle(handle), true);
    assert.deepEqual(flash.take(handle), entry);
    // Read once: the same handle names nothing now.
    assert.equal(flash.take(handle), undefined);
  });

  it("mints a different handle for every value", () => {
    const flash = store();
    const handles = new Set([
      flash.put({ invitationId: "a", personalUrl: "http://x/a" }),
      flash.put({ invitationId: "a", personalUrl: "http://x/a" }),
      flash.put({ invitationId: "a", personalUrl: "http://x/a" }),
    ]);

    assert.equal(handles.size, 3);
  });

  it("refuses a handle that cannot have been minted, without touching a stored value", () => {
    const flash = store();
    const handle = flash.put({ invitationId: "a", personalUrl: "http://x/a" });

    for (const value of ["", "corto", `${handle}=`, `${handle.slice(0, 21)}+`, null, 7]) {
      assert.equal(isFlashHandle(value), false, String(value));
      assert.equal(flash.take(value as string), undefined);
    }
    // The bogus takes above did not consume the real one.
    assert.notEqual(flash.take(handle), undefined);
  });

  it("does not consume a value the caller does not accept", () => {
    const flash = store();
    const handle = flash.put({ invitationId: "inv-1", personalUrl: "http://x/a" });

    assert.equal(
      flash.take(handle, (entry) => entry.invitationId === "otra"),
      undefined,
    );
    // The entry is still there for the page that owns it.
    assert.deepEqual(
      flash.take(handle, (entry) => entry.invitationId === "inv-1"),
      {
        invitationId: "inv-1",
        personalUrl: "http://x/a",
      },
    );
  });

  it("forgets a value after its time to live", () => {
    let now = 1_000;
    const flash = store({ ttlMs: 60_000, now: () => now });
    const handle = flash.put({ invitationId: "a", personalUrl: "http://x/a" });

    now += 59_999;
    assert.notEqual(flash.take(handle), undefined);

    const expired = flash.put({ invitationId: "b", personalUrl: "http://x/b" });
    now += 60_001;
    assert.equal(flash.take(expired), undefined);
  });

  it("stays bounded, dropping the oldest value when it is full", () => {
    const flash = store({ capacity: 2 });
    const first = flash.put({ invitationId: "1", personalUrl: "http://x/1" });
    const second = flash.put({ invitationId: "2", personalUrl: "http://x/2" });
    const third = flash.put({ invitationId: "3", personalUrl: "http://x/3" });

    assert.equal(flash.size(), 2);
    assert.equal(flash.take(first), undefined);
    assert.notEqual(flash.take(second), undefined);
    assert.notEqual(flash.take(third), undefined);
  });
});

describe("flash cookies", () => {
  it("scopes the guest-link cookie to the one attendance page and makes it short-lived", () => {
    assert.equal(GUEST_LINK_COOKIE, "invitame-enlace-invitado");
    assert.deepEqual(
      guestLinkCookie("0b8f2a3c-4d5e-4f60-8a91-2b3c4d5e6f70", "AbCdEfGhIjKlMnOpQrStUv", true),
      {
        name: "invitame-enlace-invitado",
        value: "AbCdEfGhIjKlMnOpQrStUv",
        httpOnly: true,
        sameSite: "strict",
        path: "/cuenta/invitaciones/0b8f2a3c-4d5e-4f60-8a91-2b3c4d5e6f70/asistencia",
        maxAge: FLASH_COOKIE_MAX_AGE_SECONDS,
        secure: true,
      },
    );
  });

  it("never marks the cookie secure over plain http, so a local guest-link review still works", () => {
    assert.equal(guestLinkCookie("id-invalido", "AbCdEfGhIjKlMnOpQrStUv", false).secure, false);
    assert.equal(
      guestLinkCookie("id-invalido", "AbCdEfGhIjKlMnOpQrStUv", false).path,
      "/cuenta/invitaciones/id-invalido/asistencia",
    );
  });

  it("scopes the after-sign-in cookie to /cuenta", () => {
    assert.equal(AFTER_SIGN_IN_COOKIE, "invitame-despues-de-ingresar");
    assert.deepEqual(afterSignInCookie("AbCdEfGhIjKlMnOpQrStUv", false), {
      name: "invitame-despues-de-ingresar",
      value: "AbCdEfGhIjKlMnOpQrStUv",
      httpOnly: true,
      sameSite: "strict",
      path: "/cuenta",
      maxAge: FLASH_COOKIE_MAX_AGE_SECONDS,
      secure: false,
    });
  });

  it("keeps the handle and the cookie value the same thing, never a token", () => {
    const flash = createSingleUseFlash<Entry>();
    const handle = flash.put({ invitationId: "a", personalUrl: "http://x/a" });
    const cookie = guestLinkCookie("a", handle, false);

    // The cookie carries the handle and never the personal link the handle names.
    assert.equal(cookie.value, handle);
    assert.equal(isFlashHandle(cookie.value), true);
    assert.equal(cookie.value.includes("http"), false);
  });
});

// The ready-to-share message of the access code (F13; S2.13, L18.1). The owner reads it once, right after saving the
// code, and the code itself never becomes part of a URL: it stays in this process's store behind an opaque handle, in a
// cookie scoped to the invitation's own editor.
describe("the access code's ready-to-share message (F13; L18.1)", () => {
  it("scopes the cookie to the invitation's editor and keeps the code out of it", () => {
    const cookie = passwordShareCookie("inv-1", "AbCdEfGhIjKlMnOpQrStUv", true);

    assert.equal(PASSWORD_SHARE_COOKIE, "invitame-contrasena-compartir");
    assert.deepEqual(cookie, {
      name: "invitame-contrasena-compartir",
      value: "AbCdEfGhIjKlMnOpQrStUv",
      httpOnly: true,
      sameSite: "strict",
      path: "/cuenta/invitaciones/inv-1",
      maxAge: FLASH_COOKIE_MAX_AGE_SECONDS,
      secure: true,
    });
    assert.equal(cookie.value.includes("rosas2026"), false);
  });

  it("answers the stored message exactly once, and only to the invitation it belongs to", () => {
    const handle = passwordShares.put({ invitationId: "inv-1", message: "Te invitamos: /i/ana" });

    // Another invitation's page can never read it, and reading it does not delete it.
    assert.equal(
      passwordShares.take(handle, (entry) => entry.invitationId === "inv-2"),
      undefined,
    );
    assert.deepEqual(
      passwordShares.take(handle, (entry) => entry.invitationId === "inv-1"),
      {
        invitationId: "inv-1",
        message: "Te invitamos: /i/ana",
      },
    );
    assert.equal(passwordShares.take(handle), undefined);
  });
});
