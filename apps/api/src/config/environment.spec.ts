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

  describe("email delivery settings", () => {
    // Generated per run, like the auth secret: no provider key lives in source.
    const RESEND_KEY = `re_${randomBytes(16).toString("hex")}`;
    const PRODUCTION_SENDER = "InvitaMe <no-reply@example.test>";

    function productionEnvironment(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return environmentWith({
        NODE_ENV: "production",
        EMAIL_TRANSPORT: "resend",
        EMAIL_FROM: PRODUCTION_SENDER,
        RESEND_API_KEY: RESEND_KEY,
        AUTH_CLIENT_IP_HEADER: "x-forwarded-for",
        ...overrides,
      });
    }

    it("defaults to the in-memory transport and a local sender in test", () => {
      assert.deepEqual(validateEnvironment(environmentWith()).EMAIL, {
        transport: "memory",
        from: "InvitaMe Local <no-reply@invitame.localhost>",
      });
    });

    it("defaults to the local mail catcher in development with no email variables", () => {
      assert.deepEqual(validateEnvironment(environmentWith({ NODE_ENV: undefined })).EMAIL, {
        transport: "mailpit",
        from: "InvitaMe Local <no-reply@invitame.localhost>",
        mailpitUrl: "http://localhost:8025",
      });
      assert.equal(
        validateEnvironment(environmentWith({ NODE_ENV: "development" })).EMAIL.transport,
        "mailpit",
      );
    });

    it("accepts an explicit transport and a normalized MAILPIT_URL origin", () => {
      const environment = validateEnvironment(
        environmentWith({
          EMAIL_TRANSPORT: " mailpit ",
          MAILPIT_URL: "http://127.0.0.1:18025/",
          EMAIL_FROM: "dev@example.test",
        }),
      );

      assert.deepEqual(environment.EMAIL, {
        transport: "mailpit",
        from: "dev@example.test",
        mailpitUrl: "http://127.0.0.1:18025",
      });
    });

    it("rejects an unknown transport", () => {
      assertRejected(
        { EMAIL_TRANSPORT: "smtp" },
        "EMAIL_TRANSPORT must be resend, mailpit, or memory.",
      );
    });

    it("accepts production with Resend, an API key, and a sender", () => {
      const environment = validateEnvironment(productionEnvironment());

      assert.deepEqual(environment.EMAIL, {
        transport: "resend",
        from: PRODUCTION_SENDER,
        resendApiKey: RESEND_KEY,
      });
    });

    it("defaults production to Resend, so it still requires the API key", () => {
      assertRejected(
        { NODE_ENV: "production", EMAIL_FROM: PRODUCTION_SENDER },
        "RESEND_API_KEY must be provided when EMAIL_TRANSPORT is resend.",
      );
    });

    it("fails closed when production selects any transport other than Resend", () => {
      const message = "EMAIL_TRANSPORT must be resend in production.";

      assert.throws(
        () => validateEnvironment(productionEnvironment({ EMAIL_TRANSPORT: "mailpit" })),
        { message },
      );
      assert.throws(
        () => validateEnvironment(productionEnvironment({ EMAIL_TRANSPORT: "memory" })),
        { message },
      );
    });

    it("requires EMAIL_FROM in production", () => {
      assert.throws(() => validateEnvironment(productionEnvironment({ EMAIL_FROM: undefined })), {
        message: "EMAIL_FROM must be provided.",
      });
      assert.throws(() => validateEnvironment(productionEnvironment({ EMAIL_FROM: "  " })), {
        message: "EMAIL_FROM must be provided.",
      });
    });

    it("rejects a malformed EMAIL_FROM, including header injection", () => {
      const message = 'EMAIL_FROM must be an email address or "Name <address>".';

      assertRejected({ EMAIL_FROM: "not-an-address" }, message);
      assertRejected({ EMAIL_FROM: "InvitaMe <no-reply@example.test" }, message);
      assertRejected({ EMAIL_FROM: "a@example.test\r\nBcc: victim@example.test" }, message);
    });

    it("requires RESEND_API_KEY whenever the transport is Resend, outside production too", () => {
      assertRejected(
        { EMAIL_TRANSPORT: "resend" },
        "RESEND_API_KEY must be provided when EMAIL_TRANSPORT is resend.",
      );
      assertRejected(
        { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "   " },
        "RESEND_API_KEY must be provided when EMAIL_TRANSPORT is resend.",
      );
    });

    it("never echoes the Resend API key in a startup error", () => {
      assert.throws(
        () =>
          validateEnvironment(productionEnvironment({ EMAIL_FROM: undefined, MAILPIT_URL: "x" })),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message.includes(RESEND_KEY), false);
          return true;
        },
      );
    });

    it("ignores RESEND_API_KEY when another transport is selected", () => {
      const environment = validateEnvironment(
        environmentWith({ EMAIL_TRANSPORT: "memory", RESEND_API_KEY: RESEND_KEY }),
      );

      assert.equal(JSON.stringify(environment).includes(RESEND_KEY), false);
    });

    it("rejects an invalid MAILPIT_URL", () => {
      assertRejected({ MAILPIT_URL: "not a url" }, "MAILPIT_URL must be a valid HTTP origin.");
      assertRejected(
        { MAILPIT_URL: "smtp://localhost:1025" },
        "MAILPIT_URL must use HTTP or HTTPS.",
      );
      assertRejected(
        { MAILPIT_URL: "http://localhost:8025/api/v1" },
        "MAILPIT_URL must not include a path, query, or fragment.",
      );
    });
  });

  describe("client IP settings", () => {
    function productionEnvironment(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return environmentWith({
        NODE_ENV: "production",
        EMAIL_FROM: "InvitaMe <no-reply@example.test>",
        RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
        AUTH_CLIENT_IP_HEADER: "x-real-ip",
        ...overrides,
      });
    }

    it("defaults to x-forwarded-for without trusted proxies in development and test", () => {
      for (const NODE_ENV of ["development", "test"]) {
        assert.deepEqual(validateEnvironment(environmentWith({ NODE_ENV })).AUTH_CLIENT_IP, {
          header: "x-forwarded-for",
          trustedProxies: [],
        });
      }
    });

    it("fails closed in production when no client IP header is configured", () => {
      for (const header of [undefined, "  "]) {
        assert.throws(
          () => validateEnvironment(productionEnvironment({ AUTH_CLIENT_IP_HEADER: header })),
          { message: "AUTH_CLIENT_IP_HEADER must be provided in production." },
        );
      }
    });

    it("normalizes the header name and parses a trusted proxy list", () => {
      const environment = validateEnvironment(
        productionEnvironment({
          AUTH_CLIENT_IP_HEADER: " X-Real-IP ",
          AUTH_TRUSTED_PROXIES: "10.0.0.0/8, 192.0.2.1,2001:db8::/32",
        }),
      );

      assert.deepEqual(environment.AUTH_CLIENT_IP, {
        header: "x-real-ip",
        trustedProxies: ["10.0.0.0/8", "192.0.2.1", "2001:db8::/32"],
      });
    });

    it("rejects a value that is not a single header name", () => {
      for (const header of ["x real ip", "x-real-ip, x-forwarded-for", "x-ip:"]) {
        assertRejected(
          { AUTH_CLIENT_IP_HEADER: header },
          "AUTH_CLIENT_IP_HEADER must be a single HTTP header name.",
        );
      }
    });

    it("rejects trusted proxy entries that are not an IP address or CIDR range", () => {
      for (const proxies of ["not-an-ip", "10.0.0.0/33", "2001:db8::/129", "10.0.0.1,,10.0.0.2"]) {
        assertRejected(
          { AUTH_TRUSTED_PROXIES: proxies },
          "AUTH_TRUSTED_PROXIES must list IP addresses or CIDR ranges.",
        );
      }
    });
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
