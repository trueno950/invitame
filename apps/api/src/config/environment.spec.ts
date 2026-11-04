import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { validateEnvironment } from "./environment";

// Generated per run: secrets never live in source.
const SECRET = randomBytes(32).toString("base64url");

function environmentWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const environment: Record<string, unknown> = {
    NODE_ENV: "test",
    PORT: "3001",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://invitame:invitame@localhost:5432/invitame",
    BETTER_AUTH_SECRET: SECRET,
    AUTH_BASE_URL: "http://localhost:3001",
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }

  return environment;
}

function assertRejected(overrides: Record<string, unknown>, message: string): void {
  assert.throws(() => validateEnvironment(environmentWith(overrides)), { message });
}

describe("validateEnvironment", () => {
  it("accepts a complete environment and exposes the auth settings", () => {
    const environment = validateEnvironment(environmentWith());

    assert.equal(environment.BETTER_AUTH_SECRET, SECRET);
    assert.equal(environment.AUTH_BASE_URL, "http://localhost:3001");
    assert.deepEqual(environment.TRUSTED_ORIGINS, ["http://localhost:3000"]);
  });

  describe("BETTER_AUTH_SECRET", () => {
    it("is required", () => {
      assertRejected({ BETTER_AUTH_SECRET: undefined }, "BETTER_AUTH_SECRET must be provided.");
    });

    it("rejects a blank value", () => {
      assertRejected({ BETTER_AUTH_SECRET: "   " }, "BETTER_AUTH_SECRET must be provided.");
    });

    it("rejects a secret shorter than 32 characters without echoing it", () => {
      const shortSecret = "a".repeat(31);

      assert.throws(
        () => validateEnvironment(environmentWith({ BETTER_AUTH_SECRET: shortSecret })),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "BETTER_AUTH_SECRET must be at least 32 characters long.");
          assert.equal(error.message.includes(shortSecret), false);
          return true;
        },
      );
    });

    it("accepts a secret of exactly 32 characters", () => {
      const secret = "b".repeat(32);

      assert.equal(
        validateEnvironment(environmentWith({ BETTER_AUTH_SECRET: secret })).BETTER_AUTH_SECRET,
        secret,
      );
    });
  });

  describe("AUTH_BASE_URL", () => {
    it("is required", () => {
      assertRejected({ AUTH_BASE_URL: undefined }, "AUTH_BASE_URL must be provided.");
    });

    it("rejects a value that is not a URL", () => {
      assertRejected({ AUTH_BASE_URL: "localhost:3001" }, "AUTH_BASE_URL must use HTTP or HTTPS.");
      assertRejected({ AUTH_BASE_URL: "not a url" }, "AUTH_BASE_URL must be a valid HTTP origin.");
    });

    it("rejects a non-HTTP protocol", () => {
      assertRejected(
        { AUTH_BASE_URL: "ftp://localhost:3001" },
        "AUTH_BASE_URL must use HTTP or HTTPS.",
      );
    });

    it("rejects a path, query, or fragment", () => {
      const message = "AUTH_BASE_URL must not include a path, query, or fragment.";

      assertRejected({ AUTH_BASE_URL: "http://localhost:3001/api/auth" }, message);
      assertRejected({ AUTH_BASE_URL: "http://localhost:3001?next=1" }, message);
      assertRejected({ AUTH_BASE_URL: "http://localhost:3001#auth" }, message);
    });

    it("normalizes a trailing slash and surrounding whitespace to the origin", () => {
      const environment = validateEnvironment(
        environmentWith({ AUTH_BASE_URL: " https://api.example.test/ " }),
      );

      assert.equal(environment.AUTH_BASE_URL, "https://api.example.test");
    });
  });

  describe("CORS_ORIGIN trusted-origins list", () => {
    it("is required", () => {
      assertRejected({ CORS_ORIGIN: undefined }, "CORS_ORIGIN must be provided.");
    });

    it("keeps a single origin working", () => {
      const environment = validateEnvironment(
        environmentWith({ CORS_ORIGIN: "http://localhost:3000/" }),
      );

      assert.deepEqual(environment.TRUSTED_ORIGINS, ["http://localhost:3000"]);
    });

    it("parses several comma-separated origins and trims whitespace", () => {
      const environment = validateEnvironment(
        environmentWith({
          CORS_ORIGIN:
            " http://localhost:3000 ,https://app.example.test,  https://www.example.test/ ",
        }),
      );

      assert.deepEqual(environment.TRUSTED_ORIGINS, [
        "http://localhost:3000",
        "https://app.example.test",
        "https://www.example.test",
      ]);
    });

    it("rejects empty entries", () => {
      const message = "CORS_ORIGIN must not contain empty entries.";

      assertRejected({ CORS_ORIGIN: "http://localhost:3000," }, message);
      assertRejected({ CORS_ORIGIN: "http://localhost:3000, ,https://app.example.test" }, message);
      assertRejected({ CORS_ORIGIN: ",http://localhost:3000" }, message);
    });

    it("validates every entry as an origin", () => {
      assertRejected(
        { CORS_ORIGIN: "http://localhost:3000,not a url" },
        "CORS_ORIGIN must be a valid HTTP origin.",
      );
      assertRejected(
        { CORS_ORIGIN: "http://localhost:3000,ftp://example.test" },
        "CORS_ORIGIN must use HTTP or HTTPS.",
      );
      assertRejected(
        { CORS_ORIGIN: "http://localhost:3000,https://app.example.test/path" },
        "CORS_ORIGIN must not include a path, query, or fragment.",
      );
      assertRejected(
        { CORS_ORIGIN: "https://app.example.test?x=1" },
        "CORS_ORIGIN must not include a path, query, or fragment.",
      );
    });

    it("rejects wildcard entries because CORS matches origins exactly", () => {
      assertRejected(
        { CORS_ORIGIN: "https://*.example.test" },
        "CORS_ORIGIN must not contain wildcards.",
      );
    });
  });

  it("rejects BETTER_AUTH_TRUSTED_ORIGINS so CORS and Better Auth share one list", () => {
    assertRejected(
      { BETTER_AUTH_TRUSTED_ORIGINS: "https://evil.example.test" },
      "BETTER_AUTH_TRUSTED_ORIGINS is not supported; list trusted origins in CORS_ORIGIN.",
    );
  });

  it("keeps the existing DATABASE_URL and PORT rules", () => {
    assertRejected({ DATABASE_URL: undefined }, "DATABASE_URL must be provided.");
    assertRejected(
      { DATABASE_URL: "mysql://localhost/db" },
      "DATABASE_URL must use the postgresql or postgres protocol.",
    );
    assertRejected({ PORT: "70000" }, "PORT must be an integer between 1 and 65535.");
    assert.equal(validateEnvironment(environmentWith({ PORT: undefined })).PORT, 3001);
  });
});
