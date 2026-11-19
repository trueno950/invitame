import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { validateEnvironment } from "./environment";

// The music metadata lookup setting (S2): `MUSIC_METADATA_LOOKUP` decides whether a saved playlist link may ask
// its provider for a title and a cover. It defaults to on in development and production and to off in tests, so no
// suite and no CI job reaches the network, and any other value fails closed at startup.

function developmentVariables(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: "development",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://invitame:invitame@localhost:5432/invitame",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_BASE_URL: "http://localhost:3000",
    ...overrides,
  };
}

/** A production environment that passes every other rule, so only the music setting is observed. */
function productionVariables(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: "production",
    CORS_ORIGIN: "https://app.example.test",
    AUTH_BASE_URL: "https://app.example.test",
    DATABASE_URL: "postgresql://invitame:invitame@db.example.test:5432/invitame",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    EMAIL_TRANSPORT: "resend",
    EMAIL_FROM: "InvitaMe <no-reply@example.test>",
    RESEND_API_KEY: "re_test_key",
    MEDIA_PUBLIC_BASE_URL: "https://api.example.test",
    MEDIA_STORAGE_DRIVER: "s3",
    MEDIA_S3_ENDPOINT: "https://account.r2.example.test",
    MEDIA_S3_REGION: "auto",
    MEDIA_S3_BUCKET: "invitame-media",
    MEDIA_S3_ACCESS_KEY_ID: "access-key-id",
    MEDIA_S3_SECRET_ACCESS_KEY: "secret-access-key",
    AUTH_PROXY_SECRET: randomBytes(32).toString("base64url"),
    AUTH_CLIENT_IP_HEADER: "x-forwarded-for",
    AUTH_TRUSTED_PROXIES: "10.0.0.0/8",
    PAYMENTS_MODE: "free",
    ...overrides,
  };
}

function lookupOf(overrides: Record<string, unknown>): string {
  return validateEnvironment(developmentVariables(overrides)).MUSIC.lookup;
}

function productionLookupOf(overrides: Record<string, unknown> = {}): string {
  return validateEnvironment(productionVariables(overrides)).MUSIC.lookup;
}

describe("music metadata lookup settings (S2)", () => {
  it("defaults to on in development and production, and to off in tests", () => {
    assert.equal(lookupOf({}), "on");
    assert.equal(productionLookupOf(), "on");
    // A test run must never call a provider, so the default protects every suite and every CI job.
    assert.equal(lookupOf({ NODE_ENV: "test" }), "off");
  });

  it("reads the variable when it is set, in either environment", () => {
    assert.equal(lookupOf({ MUSIC_METADATA_LOOKUP: "off" }), "off");
    assert.equal(lookupOf({ NODE_ENV: "test", MUSIC_METADATA_LOOKUP: "on" }), "on");
  });

  it("refuses a value that is neither on nor off, without echoing it", () => {
    // The surrounding spaces are trimmed like every other variable in this file: ` off ` is the value `off`.
    for (const value of ["ON", "true", "1", "oembed", "oEmbed"]) {
      const environment = developmentVariables({ MUSIC_METADATA_LOOKUP: value });

      assert.throws(
        () => validateEnvironment(environment),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "MUSIC_METADATA_LOOKUP must be on or off.");
          return true;
        },
        value,
      );
    }
  });
});
