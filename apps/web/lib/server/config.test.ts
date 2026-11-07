import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { parseWebServerConfig } from "./config.ts";

// Server-only web configuration (M2 T8b; S7, S14, L33, L36): the API's internal origin, the shared
// web-to-API secret, and the client IP headers, validated on first use. Secrets are generated per run.

const PROXY_SECRET = randomBytes(32).toString("base64url");

function production(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    API_ORIGIN: "http://api.railway.internal:3001",
    AUTH_PROXY_SECRET: PROXY_SECRET,
    AUTH_CLIENT_IP_HEADER: "x-invitame-client-ip",
    AUTH_EDGE_CLIENT_IP_HEADER: "x-real-ip",
    ...overrides,
  };
}

function assertRejected(environment: Record<string, string | undefined>, message: string): void {
  assert.throws(
    () => parseWebServerConfig(environment),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, message);
      assert.ok(!error.message.includes(PROXY_SECRET), "the secret is never echoed");
      return true;
    },
  );
}

describe("parseWebServerConfig", () => {
  it("defaults to the local API and Next's x-forwarded-for outside production", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      assert.deepEqual(parseWebServerConfig({ NODE_ENV }), {
        apiOrigin: "http://localhost:3001",
        proxySecret: undefined,
        clientIpHeader: "x-forwarded-for",
        edgeClientIpHeader: "x-forwarded-for",
      });
    }
  });

  it("accepts a complete production configuration and normalizes header names", () => {
    assert.deepEqual(
      parseWebServerConfig(
        production({
          API_ORIGIN: " http://api.railway.internal:3001/ ",
          AUTH_CLIENT_IP_HEADER: " X-InvitaMe-Client-IP ",
          AUTH_EDGE_CLIENT_IP_HEADER: "X-Real-IP",
        }),
      ),
      {
        apiOrigin: "http://api.railway.internal:3001",
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    );
  });

  it("requires every setting in production", () => {
    for (const [name, value] of [
      ["API_ORIGIN", undefined],
      ["AUTH_PROXY_SECRET", "  "],
      ["AUTH_CLIENT_IP_HEADER", undefined],
      ["AUTH_EDGE_CLIENT_IP_HEADER", ""],
    ] as const) {
      assertRejected(production({ [name]: value }), `${name} must be provided in production.`);
    }
  });

  it("accepts any spelling of a bare http(s) origin and stores its normalized form (R3-api-origin-rejects-equivalent-origins)", () => {
    for (const [origin, normalized] of [
      ["http://API:3001", "http://api:3001"],
      ["http://api:80", "http://api"],
      ["https://api:443/", "https://api"],
      // Proposed by the part C1 verification (L59): an upper-case scheme, a lone dot segment, and a
      // trailing slash are the same origin.
      ["HTTP://api:3001", "http://api:3001"],
      ["http://api:3001/.", "http://api:3001"],
      ["http://api:3001/", "http://api:3001"],
    ] as const) {
      assert.equal(
        parseWebServerConfig(production({ API_ORIGIN: origin })).apiOrigin,
        normalized,
        origin,
      );
    }
  });

  it("rejects an API_ORIGIN that is not a bare http(s) origin, without echoing it", () => {
    for (const origin of [
      "not a url",
      "http://api:99999",
      "ftp://api.example.test",
      "file:///etc/api",
      "http://localhost:3001/api",
      "http://localhost:3001/api/",
      "http://localhost:3001?probe=1",
      "http://localhost:3001/?",
      "http://localhost:3001#probe",
      "http://localhost:3001/#",
      "http://probe-user@localhost:3001",
      "http://probe-user:probe-pass@localhost:3001",
    ]) {
      assert.throws(
        () => parseWebServerConfig({ API_ORIGIN: origin }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error.message,
            "API_ORIGIN must be an http or https origin without a path, query, fragment, or credentials.",
            origin,
          );
          assert.ok(!error.message.includes("probe"), origin);
          return true;
        },
        origin,
      );
    }
  });

  it("rejects a proxy secret shorter than 32 characters without echoing it", () => {
    const short = "s".repeat(31);

    assert.throws(
      () => parseWebServerConfig({ AUTH_PROXY_SECRET: short }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "AUTH_PROXY_SECRET must be at least 32 characters long.");
        assert.ok(!error.message.includes(short));
        return true;
      },
    );
    assert.equal(
      parseWebServerConfig({ AUTH_PROXY_SECRET: "s".repeat(32) }).proxySecret,
      "s".repeat(32),
    );
  });

  it("rejects a header setting that is not a single header name", () => {
    for (const name of ["AUTH_CLIENT_IP_HEADER", "AUTH_EDGE_CLIENT_IP_HEADER"]) {
      for (const value of ["x real ip", "x-real-ip, x-forwarded-for", "x-ip:"]) {
        assertRejected({ [name]: value }, `${name} must be a single HTTP header name.`);
      }
    }
  });

  it("refuses an edge header that a client can set through Next.js in production", () => {
    for (const header of ["x-forwarded-for", "X-Forwarded-For", "forwarded"]) {
      assertRejected(
        production({ AUTH_EDGE_CLIENT_IP_HEADER: header }),
        "AUTH_EDGE_CLIENT_IP_HEADER must name a header the platform edge overwrites in production.",
      );
    }
  });

  it("refuses the proxy secret header as a client IP header", () => {
    for (const name of ["AUTH_CLIENT_IP_HEADER", "AUTH_EDGE_CLIENT_IP_HEADER"]) {
      assertRejected(
        { [name]: "x-invitame-proxy-secret" },
        `${name} must not be the proxy secret header.`,
      );
    }
  });
});
