import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SIGN_IN_COPY } from "./copy.ts";
import {
  classifyAuthResponse,
  isCompleteCode,
  isPlausibleEmail,
  normalizeCode,
  normalizeEmail,
  requestSignInCode,
  type SignInFailure,
  signInFailureMessage,
  signInWithCode,
  signOut,
} from "./sign-in.ts";

// Customer sign-in by email code from the browser (M2 T8c; S1, S6, S24, L39): every request goes to
// the same-origin `/api/auth` proxy, and every failure maps to calm Spanish copy, never to API text.

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

describe("normalizeEmail and isPlausibleEmail", () => {
  it("trims and lower-cases the address", () => {
    assert.equal(normalizeEmail("  Ana.Lopez@Ejemplo.MX \n"), "ana.lopez@ejemplo.mx");
  });

  it("accepts an address with a local part, an @, and a dotted domain", () => {
    for (const email of ["ana@ejemplo.mx", "a.b+fiesta@sub.ejemplo.com"]) {
      assert.equal(isPlausibleEmail(email), true, email);
    }
  });

  it("refuses empty, spaced, incomplete, and overlong addresses", () => {
    const overlong = `${"a".repeat(250)}@ejemplo.mx`;
    for (const email of [
      "",
      "ana",
      "ana@",
      "@ejemplo.mx",
      "ana@ejemplo",
      "ana @ejemplo.mx",
      overlong,
    ]) {
      assert.equal(isPlausibleEmail(email), false, email);
    }
  });
});

describe("normalizeCode and isCompleteCode", () => {
  it("keeps only ASCII digits and at most six of them", () => {
    assert.equal(normalizeCode(" 123 456 "), "123456");
    assert.equal(normalizeCode("12-34-56-78"), "123456");
    assert.equal(normalizeCode("abc"), "");
  });

  it("accepts exactly six digits", () => {
    assert.equal(isCompleteCode("123456"), true);
    assert.equal(isCompleteCode("12345"), false);
    assert.equal(isCompleteCode("1234567"), false);
    assert.equal(isCompleteCode("12345a"), false);
  });
});

describe("classifyAuthResponse", () => {
  it("treats any 2xx as success", async () => {
    assert.deepEqual(await classifyAuthResponse(json(200, { success: true })), { ok: true });
  });

  it("maps a wrong or expired code (400 INVALID_OTP, 400 OTP_EXPIRED) to invalid-code", async () => {
    for (const code of ["INVALID_OTP", "OTP_EXPIRED"]) {
      assert.deepEqual(await classifyAuthResponse(json(400, { code, message: "Invalid OTP" })), {
        ok: false,
        failure: "invalid-code",
      });
    }
  });

  it("maps a rate limit (429) to too-many-attempts", async () => {
    assert.deepEqual(
      await classifyAuthResponse(new Response("Too many requests", { status: 429 })),
      {
        ok: false,
        failure: "too-many-attempts",
      },
    );
  });

  it("maps every other answer, including 403 and other 400s, to unavailable", async () => {
    const answers = [
      json(403, { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" }),
      json(403, { code: "FORBIDDEN" }),
      json(400, { code: "VALIDATION_ERROR", message: "Invalid email" }),
      new Response("not json", { status: 400 }),
      json(502, { code: "SERVICE_UNAVAILABLE" }),
      json(503, { code: "SERVICE_UNAVAILABLE" }),
      new Response(null, { status: 302 }),
    ];
    for (const answer of answers) {
      assert.deepEqual(
        await classifyAuthResponse(answer),
        { ok: false, failure: "unavailable" },
        String(answer.status),
      );
    }
  });
});

describe("signInFailureMessage", () => {
  it("gives one fixed Spanish message per failure", () => {
    const expected: Record<SignInFailure, string> = {
      "invalid-code": SIGN_IN_COPY.invalidCode,
      "too-many-attempts": SIGN_IN_COPY.tooManyAttempts,
      unavailable: SIGN_IN_COPY.unavailable,
    };
    for (const [failure, message] of Object.entries(expected)) {
      assert.equal(signInFailureMessage(failure as SignInFailure), message);
    }
  });
});

describe("requestSignInCode", () => {
  it("POSTs { email, type: 'sign-in' } as JSON to the same-origin proxy", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { success: true }));

    assert.deepEqual(await requestSignInCode(fetch, "ana@ejemplo.mx"), { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "/api/auth/email-otp/send-verification-otp");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(calls[0]?.init.credentials, "same-origin");
    assert.equal(calls[0]?.init.cache, "no-store");
    assert.equal(new Headers(calls[0]?.init.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      email: "ana@ejemplo.mx",
      type: "sign-in",
    });
  });

  it("returns unavailable when the network fails, without throwing", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    assert.deepEqual(await requestSignInCode(fetch, "ana@ejemplo.mx"), {
      ok: false,
      failure: "unavailable",
    });
  });

  it("maps a 429 to too-many-attempts", async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 429 }));

    assert.deepEqual(await requestSignInCode(fetch, "ana@ejemplo.mx"), {
      ok: false,
      failure: "too-many-attempts",
    });
  });
});

describe("signInWithCode", () => {
  it("POSTs { email, otp } as JSON to the same-origin proxy", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { token: "ignored", user: {} }));

    assert.deepEqual(await signInWithCode(fetch, "ana@ejemplo.mx", "123456"), { ok: true });
    assert.equal(calls[0]?.input, "/api/auth/sign-in/email-otp");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(calls[0]?.init.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      email: "ana@ejemplo.mx",
      otp: "123456",
    });
  });

  it("maps a wrong code to invalid-code", async () => {
    const { fetch } = fakeFetch(() => json(400, { code: "INVALID_OTP", message: "Invalid OTP" }));

    assert.deepEqual(await signInWithCode(fetch, "ana@ejemplo.mx", "000000"), {
      ok: false,
      failure: "invalid-code",
    });
  });
});

describe("signOut", () => {
  it("POSTs an empty JSON object to the same-origin proxy and reports success", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { success: true }));

    assert.equal(await signOut(fetch), true);
    assert.equal(calls[0]?.input, "/api/auth/sign-out");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(calls[0]?.init.credentials, "same-origin");
    assert.equal(calls[0]?.init.body, "{}");
  });

  it("reports failure on a non-2xx answer or a network error, without throwing", async () => {
    assert.equal(await signOut(fakeFetch(() => json(502, {})).fetch), false);
    assert.equal(
      await signOut(
        fakeFetch(() => {
          throw new TypeError("Failed to fetch");
        }).fetch,
      ),
      false,
    );
  });
});
