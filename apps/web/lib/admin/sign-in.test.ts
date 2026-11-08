import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_SIGN_IN_COPY } from "./copy.ts";
import {
  type AdminSignInFailure,
  adminSignInFailureMessage,
  classifyPasswordResponse,
  classifySecondFactorResponse,
  isCompleteAuthenticatorCode,
  isPlausibleBackupCode,
  normalizeAuthenticatorCode,
  normalizeBackupCode,
  type SecondFactorFailure,
  secondFactorFailureMessage,
  signInWithPassword,
  verifyAuthenticatorCode,
  verifyBackupCode,
} from "./sign-in.ts";

// Administrator sign-in from the browser (M2 T8d; S6, S20, S22, S36): password first, then the code
// of the authenticator app or a backup code, every request through the same-origin `/api/auth`
// proxy, and every answer mapped to fixed Spanish copy that never says whether an address exists.

interface Call {
  input: string;
  init: RequestInit;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const call = { input, init };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

const SESSION_BODY = {
  redirect: false,
  token: "opaque",
  user: { id: "u1", email: "admin@example.test", role: "ADMIN", twoFactorEnabled: false },
};

describe("normalizeAuthenticatorCode and isCompleteAuthenticatorCode", () => {
  it("keeps ASCII digits only and at most six of them", () => {
    assert.equal(normalizeAuthenticatorCode(" 123 456 "), "123456");
    assert.equal(normalizeAuthenticatorCode("123-4567"), "123456");
    assert.equal(normalizeAuthenticatorCode("١٢٣abc"), "");
  });

  it("accepts exactly six digits", () => {
    assert.equal(isCompleteAuthenticatorCode("123456"), true);
    for (const code of ["", "12345", "1234567", "12345a"]) {
      assert.equal(isCompleteAuthenticatorCode(code), false, code);
    }
  });

  it("keeps the outputs of the customer normalizeCode it replaced (3cdde74)", () => {
    // [typed or pasted input, normalized code, complete]. The baseline kept /[0-9]/ only, cut at 6,
    // and called a code complete when it matched /^[0-9]{6}$/.
    const cases: Array<[string, string, boolean]> = [
      ["123456", "123456", true],
      [" 123 456 ", "123456", true],
      ["12\t34\u00a056", "123456", true],
      ["123-456", "123456", true],
      ["1234567890", "123456", true],
      ["12 34 56 78", "123456", true],
      ["１２３４５６", "", false],
      ["١٢٣456", "456", false],
      ["12345", "12345", false],
      ["12a45b", "1245", false],
      ["", "", false],
    ];
    for (const [input, normalized, complete] of cases) {
      assert.equal(normalizeAuthenticatorCode(input), normalized, input);
      assert.equal(isCompleteAuthenticatorCode(normalizeAuthenticatorCode(input)), complete, input);
    }
  });
});

describe("normalizeBackupCode and isPlausibleBackupCode", () => {
  it("removes spaces and keeps the letters' case, which the API compares exactly", () => {
    assert.equal(normalizeBackupCode("  aB3dE-fG7hJ \n"), "aB3dE-fG7hJ");
    assert.equal(normalizeBackupCode("aB3dE - fG7hJ"), "aB3dE-fG7hJ");
  });

  it("adds the middle dash when the code was typed without it", () => {
    assert.equal(normalizeBackupCode("aB3dEfG7hJ"), "aB3dE-fG7hJ");
    assert.equal(normalizeBackupCode("aB3dE fG7hJ"), "aB3dE-fG7hJ");
  });

  it("accepts five letters or digits, a dash, and five more", () => {
    assert.equal(isPlausibleBackupCode("aB3dE-fG7hJ"), true);
    for (const code of ["", "aB3dE", "aB3dE-fG7h", "aB3dE-fG7hJK", "aB3d_-fG7hJ", "aB3dEfG7hJ"]) {
      assert.equal(isPlausibleBackupCode(code), false, code);
    }
  });
});

describe("classifyPasswordResponse", () => {
  it("asks for the second factor when the API answers twoFactorRedirect", async () => {
    const outcome = await classifyPasswordResponse(
      json(200, { twoFactorRedirect: true, twoFactorMethods: ["totp"] }),
    );
    assert.deepEqual(outcome, { ok: true, next: "second-factor" });
  });

  it("reports a session when the API signs a pending administrator in at once", async () => {
    assert.deepEqual(await classifyPasswordResponse(json(200, SESSION_BODY)), {
      ok: true,
      next: "signed-in",
    });
  });

  it("treats a success with neither shape as unavailable", async () => {
    for (const body of [null, {}, { twoFactorRedirect: "yes" }, "text"]) {
      assert.deepEqual(
        await classifyPasswordResponse(json(200, body)),
        { ok: false, failure: "unavailable" },
        JSON.stringify(body),
      );
    }
  });

  it("maps every refused credential to one generic failure, whatever the API's code", async () => {
    for (const response of [
      json(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }),
      json(401, { code: "FAILED_TO_CREATE_SESSION" }),
      json(400, { code: "INVALID_EMAIL", message: "Invalid email" }),
      new Response("not json", { status: 401 }),
    ]) {
      assert.deepEqual(await classifyPasswordResponse(response), {
        ok: false,
        failure: "invalid-credentials",
      });
    }
  });

  it("maps a rate limit to its own failure", async () => {
    assert.deepEqual(await classifyPasswordResponse(json(429, { message: "Too many" })), {
      ok: false,
      failure: "too-many-attempts",
    });
  });

  it("maps a refused origin, a redirect, and server errors to unavailable", async () => {
    for (const status of [403, 302, 500, 502, 503, 504]) {
      const response = status === 302 ? new Response(null, { status }) : json(status, {});
      assert.deepEqual(
        await classifyPasswordResponse(response),
        { ok: false, failure: "unavailable" },
        String(status),
      );
    }
  });
});

describe("classifySecondFactorResponse", () => {
  const cases: Array<[() => Response, SecondFactorFailure | null]> = [
    [() => json(200, { token: "t", user: {} }), null],
    [() => json(401, { code: "INVALID_CODE", message: "Invalid code" }), "invalid-code"],
    [() => json(401, { code: "INVALID_BACKUP_CODE" }), "invalid-backup-code"],
    [() => json(401, { code: "INVALID_TWO_FACTOR_COOKIE" }), "challenge-expired"],
    [() => json(400, { code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" }), "attempts-exhausted"],
    [() => json(429, { code: "ACCOUNT_TEMPORARILY_LOCKED" }), "locked"],
    [
      () => json(429, { message: "Too many requests. Please try again later." }),
      "too-many-attempts",
    ],
    [() => json(400, { code: "TOTP_NOT_ENABLED" }), "unavailable"],
    [() => json(401, { code: "UNAUTHORIZED" }), "challenge-expired"],
    [() => json(503, { code: "SERVICE_UNAVAILABLE" }), "unavailable"],
    [() => new Response("<html>", { status: 502 }), "unavailable"],
  ];

  for (const [response, failure] of cases) {
    it(`maps ${response().status} to ${failure ?? "success"}`, async () => {
      const expected = failure === null ? { ok: true } : { ok: false, failure };
      assert.deepEqual(await classifySecondFactorResponse(response()), expected);
    });
  }
});

describe("browser requests", () => {
  it("posts the email and password to the proxy, same-origin and uncached", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json(200, { twoFactorRedirect: true, twoFactorMethods: ["totp"] }),
    );
    await signInWithPassword(fetch, "admin@example.test", " pass word ");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "/api/auth/sign-in/email");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(calls[0]?.init.credentials, "same-origin");
    assert.equal(calls[0]?.init.cache, "no-store");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      email: "admin@example.test",
      password: " pass word ",
    });
  });

  it("posts the authenticator code and never asks to trust the device", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, {}));
    assert.deepEqual(await verifyAuthenticatorCode(fetch, "123456"), { ok: true });
    assert.equal(calls[0]?.input, "/api/auth/two-factor/verify-totp");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { code: "123456" });
  });

  it("posts the backup code", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, {}));
    assert.deepEqual(await verifyBackupCode(fetch, "aB3dE-fG7hJ"), { ok: true });
    assert.equal(calls[0]?.input, "/api/auth/two-factor/verify-backup-code");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { code: "aB3dE-fG7hJ" });
  });

  it("turns a network failure into unavailable instead of throwing", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    assert.deepEqual(await signInWithPassword(fetch, "a@b.mx", "x"), {
      ok: false,
      failure: "unavailable",
    });
    assert.deepEqual(await verifyAuthenticatorCode(fetch, "123456"), {
      ok: false,
      failure: "unavailable",
    });
    assert.deepEqual(await verifyBackupCode(fetch, "aB3dE-fG7hJ"), {
      ok: false,
      failure: "unavailable",
    });
  });
});

describe("failure messages", () => {
  it("gives every password failure fixed copy", () => {
    const expected: Record<AdminSignInFailure, string> = {
      "invalid-credentials": ADMIN_SIGN_IN_COPY.invalidCredentials,
      "too-many-attempts": ADMIN_SIGN_IN_COPY.tooManyAttempts,
      unavailable: ADMIN_SIGN_IN_COPY.unavailable,
    };
    for (const [failure, message] of Object.entries(expected)) {
      assert.equal(adminSignInFailureMessage(failure as AdminSignInFailure), message);
    }
  });

  it("gives every second-factor failure fixed copy", () => {
    const expected: Record<SecondFactorFailure, string> = {
      "invalid-code": ADMIN_SIGN_IN_COPY.invalidCode,
      "invalid-backup-code": ADMIN_SIGN_IN_COPY.invalidBackupCode,
      "challenge-expired": ADMIN_SIGN_IN_COPY.challengeExpired,
      "attempts-exhausted": ADMIN_SIGN_IN_COPY.attemptsExhausted,
      locked: ADMIN_SIGN_IN_COPY.locked,
      "too-many-attempts": ADMIN_SIGN_IN_COPY.tooManyAttempts,
      unavailable: ADMIN_SIGN_IN_COPY.unavailable,
    };
    for (const [failure, message] of Object.entries(expected)) {
      assert.equal(secondFactorFailureMessage(failure as SecondFactorFailure), message);
    }
  });
});
