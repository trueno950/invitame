import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyConfirmResponse,
  classifyEnableResponse,
  type ConfirmFailure,
  confirmEnrollment,
  confirmFailureMessage,
  type EnableFailure,
  enableFailureMessage,
  groupSetupKey,
  offersSignInAgain,
  setupKeyFromUri,
  startEnrollment,
} from "./enrollment.ts";
import { ENROLLMENT_COPY } from "./enrollment-copy.ts";

// Enrollment of the authenticator app at `/admin/activar` (M2 T8d; S6, S21, S36, L42): the password
// starts it (`/two-factor/enable`), the first code confirms it (`/two-factor/verify-totp`), and the
// TOTP URI, its setup key, and the backup codes stay in the browser's memory: never in a URL.

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

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSW";
const URI = `otpauth://totp/InvitaMe:admin%40example.test?secret=${SECRET}&issuer=InvitaMe&digits=6&period=30`;
const BACKUP_CODES = Array.from({ length: 10 }, (_, index) => `aB3d${index}-fG7h${index}`);
const ENABLED = { method: "totp", totpURI: URI, backupCodes: BACKUP_CODES };

describe("setupKeyFromUri and groupSetupKey", () => {
  it("reads the secret from the TOTP URI, upper-cased and without padding", () => {
    assert.equal(setupKeyFromUri(URI), SECRET);
    assert.equal(setupKeyFromUri("otpauth://totp/x?secret=jbswy3dp%3D%3D"), "JBSWY3DP");
  });

  it("returns undefined for a URI that is not a TOTP URI with a base32 secret", () => {
    for (const uri of [
      "",
      "https://example.test/?secret=JBSWY3DP",
      "otpauth://hotp/x?secret=JBSWY3DP",
      "otpauth://totp/x",
      "otpauth://totp/x?secret=not-base32!",
    ]) {
      assert.equal(setupKeyFromUri(uri), undefined, uri);
    }
  });

  it("groups the key in fours for reading aloud and typing", () => {
    assert.equal(groupSetupKey("JBSWY3DPEHPK3PXP"), "JBSW Y3DP EHPK 3PXP");
    assert.equal(groupSetupKey("JBSWY3DPEH"), "JBSW Y3DP EH");
    assert.equal(groupSetupKey(""), "");
  });
});

describe("classifyEnableResponse", () => {
  it("returns the URI, the setup key, and the backup codes of a valid answer", async () => {
    const outcome = await classifyEnableResponse(json(200, ENABLED));
    assert.deepEqual(outcome, {
      ok: true,
      enrollment: { totpURI: URI, setupKey: SECRET, backupCodes: BACKUP_CODES },
    });
  });

  it("treats a success without a TOTP URI or backup codes as unavailable", async () => {
    for (const body of [
      {},
      { method: "otp" },
      { ...ENABLED, totpURI: "https://example.test" },
      { ...ENABLED, backupCodes: [] },
      { ...ENABLED, backupCodes: ["ok", 7] },
      { ...ENABLED, backupCodes: "aB3d0-fG7h0" },
    ]) {
      assert.deepEqual(
        await classifyEnableResponse(json(200, body)),
        { ok: false, failure: "unavailable" },
        JSON.stringify(body),
      );
    }
  });

  const failures: Array<[() => Response, EnableFailure]> = [
    [
      () => json(400, { code: "INVALID_PASSWORD", message: "Invalid password" }),
      "invalid-password",
    ],
    [() => json(400, { code: "TOTP_ALREADY_ENABLED" }), "already-enrolled"],
    [() => json(401, { code: "UNAUTHORIZED" }), "session-ended"],
    // Only the confirmation can be superseded; the enable step keeps reading every 401 as an ended session.
    [() => json(401, { code: "ENROLLMENT_SUPERSEDED" }), "session-ended"],
    [
      () => json(429, { message: "Too many requests. Please try again later." }),
      "too-many-attempts",
    ],
    [() => json(400, { code: "OTP_NOT_CONFIGURED" }), "unavailable"],
    [() => json(503, { code: "SERVICE_UNAVAILABLE" }), "unavailable"],
    [() => json(403, { code: "FORBIDDEN" }), "unavailable"],
  ];

  for (const [response, failure] of failures) {
    it(`maps ${response().status} to ${failure}`, async () => {
      assert.deepEqual(await classifyEnableResponse(response()), { ok: false, failure });
    });
  }
});

describe("classifyConfirmResponse", () => {
  const cases: Array<[() => Response, ConfirmFailure | null]> = [
    [() => json(200, { token: "t", user: {} }), null],
    [() => json(401, { code: "INVALID_CODE", message: "Invalid code" }), "invalid-code"],
    [() => json(401, { code: "INVALID_TWO_FACTOR_COOKIE" }), "session-ended"],
    [() => json(401, { code: "UNAUTHORIZED" }), "session-ended"],
    [() => json(401, {}), "session-ended"],
    // A first confirmation that lost a race to another one, a reissue, a disable, or a sign-out (S45).
    [
      () => json(401, { code: "ENROLLMENT_SUPERSEDED", message: "Enrollment superseded" }),
      "enrollment-superseded",
    ],
    [() => json(429, { message: "Too many" }), "too-many-attempts"],
    [() => json(400, { code: "TOTP_NOT_ENABLED" }), "unavailable"],
    [() => json(502, {}), "unavailable"],
  ];

  for (const [response, failure] of cases) {
    it(`maps ${response().status} to ${failure ?? "success"}`, async () => {
      const expected = failure === null ? { ok: true } : { ok: false, failure };
      assert.deepEqual(await classifyConfirmResponse(response()), expected);
    });
  }
});

describe("browser requests", () => {
  it("starts enrollment with the password in the body of a same-origin POST", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, ENABLED));
    const outcome = await startEnrollment(fetch, "a long password");

    assert.equal(outcome.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "/api/auth/two-factor/enable");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(calls[0]?.init.credentials, "same-origin");
    assert.equal(calls[0]?.init.cache, "no-store");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { password: "a long password" });
  });

  it("confirms with the code only: the URI, key, and backup codes never leave memory", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, {}));
    assert.deepEqual(await confirmEnrollment(fetch, "123456"), { ok: true });

    assert.equal(calls[0]?.input, "/api/auth/two-factor/verify-totp");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { code: "123456" });
    for (const call of calls) {
      assert.doesNotMatch(call.input, /\?|secret|otpauth/i);
      assert.doesNotMatch(String(call.init.body), new RegExp(`${SECRET}|aB3d0`));
    }
  });

  it("turns a network failure into unavailable", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    assert.deepEqual(await startEnrollment(fetch, "x"), { ok: false, failure: "unavailable" });
    assert.deepEqual(await confirmEnrollment(fetch, "123456"), {
      ok: false,
      failure: "unavailable",
    });
  });
});

describe("enrollment copy", () => {
  it("gives every failure fixed copy", () => {
    const enable: Record<EnableFailure, string> = {
      "invalid-password": ENROLLMENT_COPY.invalidPassword,
      "already-enrolled": ENROLLMENT_COPY.alreadyEnrolled,
      "session-ended": ENROLLMENT_COPY.sessionEnded,
      "too-many-attempts": ENROLLMENT_COPY.tooManyAttempts,
      unavailable: ENROLLMENT_COPY.unavailable,
    };
    for (const [failure, message] of Object.entries(enable)) {
      assert.equal(enableFailureMessage(failure as EnableFailure), message);
    }
    const confirm: Record<ConfirmFailure, string> = {
      "invalid-code": ENROLLMENT_COPY.invalidCode,
      "session-ended": ENROLLMENT_COPY.sessionEnded,
      "enrollment-superseded": ENROLLMENT_COPY.enrollmentSuperseded,
      "too-many-attempts": ENROLLMENT_COPY.tooManyAttempts,
      unavailable: ENROLLMENT_COPY.unavailable,
    };
    for (const [failure, message] of Object.entries(confirm)) {
      assert.equal(confirmFailureMessage(failure as ConfirmFailure), message);
    }
  });

  it("says why a superseded confirmation ended, and keeps the ended-session text for every other 401 (S45)", () => {
    assert.equal(
      confirmFailureMessage("enrollment-superseded"),
      "Esta activación ya no es válida. Ingresa de nuevo con tu correo y tu contraseña.",
    );
    const sessionEnded = "Tu sesión terminó. Ingresa de nuevo con tu correo y tu contraseña.";
    assert.equal(confirmFailureMessage("session-ended"), sessionEnded);
    assert.equal(enableFailureMessage("session-ended"), sessionEnded);
  });

  it("offers signing in again only when the activation cannot go on (S45)", () => {
    const ends = new Set<EnableFailure | ConfirmFailure>([
      "session-ended",
      "enrollment-superseded",
    ]);
    const failures: Array<EnableFailure | ConfirmFailure> = [
      "invalid-password",
      "already-enrolled",
      "invalid-code",
      "session-ended",
      "enrollment-superseded",
      "too-many-attempts",
      "unavailable",
    ];
    for (const failure of failures) {
      assert.equal(offersSignInAgain(failure), ends.has(failure), failure);
    }
  });

  it("addresses the administrator with tú, without em dashes", () => {
    const formal =
      /\b(usted|su contraseña|su app|ingrese|escriba|escanee|guarde|revise|intente)\b/i;
    for (const value of Object.values(ENROLLMENT_COPY)) {
      const text = typeof value === "function" ? value(3) : value;
      assert.ok(text.trim().length > 0);
      assert.doesNotMatch(text, formal, text);
      assert.ok(!text.includes("—") && !text.includes("--"), text);
    }
  });

  it("says the backup codes are shown only once and asks for an explicit confirmation", () => {
    assert.match(ENROLLMENT_COPY.backupCodesIntro, /una sola vez/i);
    assert.equal(ENROLLMENT_COPY.savedCodes, "Ya los guardé");
  });
});
