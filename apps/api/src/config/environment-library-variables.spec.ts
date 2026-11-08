import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateEnvironment } from "./environment";

// Better Auth reads some variables on its own (1.7.16 `context/create-context.mjs`):
// `BETTER_AUTH_SECRETS` ("<version>:<secret>" entries) replaces the `secret` option, so it would
// override the validated `BETTER_AUTH_SECRET` and skip its length and distinctness rules (S55, L79).
// The API already refuses `BETTER_AUTH_TRUSTED_ORIGINS` for the same reason.

const VALID = {
  NODE_ENV: "test",
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://invitame:invitame_local_only@localhost:5442/invitame?schema=public",
  BETTER_AUTH_SECRET: "a".repeat(40),
  AUTH_BASE_URL: "http://localhost:3000",
} as const;

describe("variables that Better Auth reads by itself (S55)", () => {
  it("refuses BETTER_AUTH_SECRETS, which would replace the validated BETTER_AUTH_SECRET", () => {
    assert.throws(
      () => validateEnvironment({ ...VALID, BETTER_AUTH_SECRETS: "1:short" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /BETTER_AUTH_SECRETS/);
        assert.ok(!error.message.includes("short"), "the value is never echoed");
        return true;
      },
    );
  });

  it("refuses it in production too, where a replaced secret matters most", () => {
    assert.throws(
      () =>
        validateEnvironment({
          ...VALID,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://app.example.test",
          AUTH_BASE_URL: "https://app.example.test",
          EMAIL_FROM: "InvitaMe <no-reply@example.test>",
          RESEND_API_KEY: "re_test_key",
          AUTH_CLIENT_IP_HEADER: "x-forwarded-for",
          AUTH_PROXY_SECRET: "p".repeat(40),
          BETTER_AUTH_SECRETS: "1:short",
        }),
      { message: /BETTER_AUTH_SECRETS/ },
    );
  });

  it("still accepts the validated environment without it", () => {
    assert.doesNotThrow(() => validateEnvironment(VALID));
  });

  it("accepts an empty value, which Better Auth reads as absent (the e2e API sets both to empty)", () => {
    assert.doesNotThrow(() =>
      validateEnvironment({ ...VALID, BETTER_AUTH_SECRETS: "", BETTER_AUTH_TRUSTED_ORIGINS: "" }),
    );
  });

  // Better Auth reads the raw value: "  " is set for it (`BETTER_AUTH_SECRETS` is parsed, and
  // `BETTER_AUTH_TRUSTED_ORIGINS` adds the blank entry), so a trimmed check would disagree with it.
  // The whole message is fixed, so no form of the value, raw or escaped, can appear in it.
  const REFUSAL = {
    BETTER_AUTH_SECRETS: "BETTER_AUTH_SECRETS is not supported; set BETTER_AUTH_SECRET.",
    BETTER_AUTH_TRUSTED_ORIGINS:
      "BETTER_AUTH_TRUSTED_ORIGINS is not supported; list trusted origins in CORS_ORIGIN.",
  } as const;
  for (const name of ["BETTER_AUTH_SECRETS", "BETTER_AUTH_TRUSTED_ORIGINS"] as const) {
    for (const blank of [" ", "  ", "\t", "\n"]) {
      it(`refuses ${name} holding only whitespace (${JSON.stringify(blank)}) and never echoes it`, () => {
        assert.throws(() => validateEnvironment({ ...VALID, [name]: blank }), {
          message: REFUSAL[name],
        });
      });
    }
  }
});
