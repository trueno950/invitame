import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { PAYMENTS_MODE, validateEnvironment } from "./environment";

// The payments configuration (M7 S1, S4). Production has no silent default: the API refuses to start without an
// explicit `PAYMENTS_MODE`, and `simulated` — the development provider that signs its own events — is refused
// there, so a deployment can never grant publication from an event the API itself could have minted. Development
// and test default to `free`, which is the Milestone 5 behavior and needs no migration, no secret, and no new
// variable; switching to the simulated flow is one explicit variable plus its secret.

const SECRET = randomBytes(32).toString("base64url");
const SIMULATED_SECRET = randomBytes(32).toString("base64url");

function environmentWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const environment: Record<string, unknown> = {
    NODE_ENV: "test",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://invitame:invitame@localhost:5432/invitame",
    BETTER_AUTH_SECRET: SECRET,
    AUTH_BASE_URL: "http://localhost:3000",
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }

  if (environment.NODE_ENV === "production") {
    environment.MEDIA_STORAGE_DRIVER ??= "s3";
    environment.MEDIA_PUBLIC_BASE_URL ??= "https://api.example.test";
    environment.MEDIA_S3_ENDPOINT ??= "https://account.r2.example.test";
    environment.MEDIA_S3_REGION ??= "auto";
    environment.MEDIA_S3_BUCKET ??= "invitame-media";
    environment.MEDIA_S3_ACCESS_KEY_ID ??= "test-access-key-id";
    environment.MEDIA_S3_SECRET_ACCESS_KEY ??= "test-secret-access-key";
    environment.EMAIL_FROM ??= "InvitaMe <no-reply@example.test>";
    environment.RESEND_API_KEY ??= "test-resend-key";
    environment.AUTH_CLIENT_IP_HEADER ??= "cf-connecting-ip";
    environment.AUTH_PROXY_SECRET ??= randomBytes(32).toString("base64url");
  }

  return environment;
}

function assertRejected(overrides: Record<string, unknown>, message: string): void {
  assert.throws(() => validateEnvironment(environmentWith(overrides)), { message });
}

describe("payments environment (M7 S1, S4)", () => {
  it("defaults to free in development and in test, so nothing new is required locally", () => {
    for (const NODE_ENV of ["development", "test"]) {
      const environment = validateEnvironment(environmentWith({ NODE_ENV }));

      assert.deepEqual(environment.PAYMENTS, { mode: PAYMENTS_MODE.FREE }, NODE_ENV);
    }
  });

  it("reads an explicit free mode", () => {
    const environment = validateEnvironment(environmentWith({ PAYMENTS_MODE: "free" }));

    assert.deepEqual(environment.PAYMENTS, { mode: PAYMENTS_MODE.FREE });
  });

  it("accepts simulated outside production with its secret and the default return base URL", () => {
    const environment = validateEnvironment(
      environmentWith({ PAYMENTS_MODE: "simulated", PAYMENTS_SIMULATED_SECRET: SIMULATED_SECRET }),
    );

    assert.deepEqual(environment.PAYMENTS, {
      mode: PAYMENTS_MODE.SIMULATED,
      secret: SIMULATED_SECRET,
      returnBaseUrl: "http://localhost:3000",
    });
  });

  it("reads an explicit return base URL and trims its trailing slash", () => {
    const environment = validateEnvironment(
      environmentWith({
        PAYMENTS_MODE: "simulated",
        PAYMENTS_SIMULATED_SECRET: SIMULATED_SECRET,
        PAYMENTS_RETURN_BASE_URL: "http://localhost:3001/",
      }),
    );

    assert.equal(
      environment.PAYMENTS.mode === PAYMENTS_MODE.SIMULATED
        ? environment.PAYMENTS.returnBaseUrl
        : null,
      "http://localhost:3001",
    );
  });

  it("requires an explicit mode in production, without a silent default", () => {
    assertRejected({ NODE_ENV: "production" }, "PAYMENTS_MODE must be provided in production.");
  });

  it("refuses simulated in production, so no deployment can mint its own paid events", () => {
    assertRejected(
      {
        NODE_ENV: "production",
        PAYMENTS_MODE: "simulated",
        PAYMENTS_SIMULATED_SECRET: SIMULATED_SECRET,
      },
      "PAYMENTS_MODE must not be simulated in production.",
    );
  });

  it("refuses an unknown mode without echoing it", () => {
    for (const PAYMENTS_MODE of ["mercadopago", "FREE", "test"]) {
      assertRejected({ PAYMENTS_MODE }, "PAYMENTS_MODE must be free or simulated.");
    }
  });

  it("requires the simulated secret when simulated is selected", () => {
    for (const value of [undefined, "", "   "]) {
      assertRejected(
        { PAYMENTS_MODE: "simulated", PAYMENTS_SIMULATED_SECRET: value },
        "PAYMENTS_SIMULATED_SECRET must be provided when PAYMENTS_MODE is simulated.",
      );
    }
  });

  it("refuses a simulated secret shorter than 32 characters", () => {
    assertRejected(
      { PAYMENTS_MODE: "simulated", PAYMENTS_SIMULATED_SECRET: "short" },
      "PAYMENTS_SIMULATED_SECRET must be at least 32 characters long.",
    );
  });

  it("refuses a simulated secret that is one of the other secrets, naming which one", () => {
    assertRejected(
      { PAYMENTS_MODE: "simulated", PAYMENTS_SIMULATED_SECRET: SECRET },
      "PAYMENTS_SIMULATED_SECRET must differ from BETTER_AUTH_SECRET.",
    );

    const proxySecret = randomBytes(32).toString("base64url");
    assertRejected(
      {
        NODE_ENV: "development",
        AUTH_PROXY_SECRET: proxySecret,
        PAYMENTS_MODE: "simulated",
        PAYMENTS_SIMULATED_SECRET: proxySecret,
      },
      "PAYMENTS_SIMULATED_SECRET must differ from AUTH_PROXY_SECRET.",
    );
  });

  it("refuses a return base URL that is not an http origin", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["not-a-url", "PAYMENTS_RETURN_BASE_URL must be a valid HTTP origin."],
      ["ftp://example.test", "PAYMENTS_RETURN_BASE_URL must use HTTP or HTTPS."],
      [
        "http://example.test/path",
        "PAYMENTS_RETURN_BASE_URL must not include a path, query, or fragment.",
      ],
    ];

    for (const [value, message] of cases) {
      assertRejected(
        {
          PAYMENTS_MODE: "simulated",
          PAYMENTS_SIMULATED_SECRET: SIMULATED_SECRET,
          PAYMENTS_RETURN_BASE_URL: value,
        },
        message,
      );
    }
  });

  it("never echoes a secret in an error message", () => {
    // Reusing the auth secret is refused; the message names the variable and never its value.
    assert.throws(
      () =>
        validateEnvironment(
          environmentWith({ PAYMENTS_MODE: "simulated", PAYMENTS_SIMULATED_SECRET: SECRET }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(SECRET), false);
        return true;
      },
    );
  });
});
