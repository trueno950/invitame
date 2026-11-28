import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { validateEnvironment } from "./environment";

// The place-search settings (S2): `PLACE_SEARCH_PROVIDER` decides whether the owner's address fields may ask a
// geocoder at all, and `PLACE_SEARCH_PHOTON_URL` names the instance. It defaults to `photon` in development and
// production and to `off` in tests, so no suite and no CI job reaches the network, and any other provider value
// fails closed at startup. The URL is the seam that lets a self-hosted Photon replace the public instance.

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

/** A production environment that passes every other rule, so only the place-search setting is observed. */
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
    // F13 (L18.2): production names the invitation access-token key too.
    INVITATION_ACCESS_SECRET: randomBytes(32).toString("base64url"),
    AUTH_CLIENT_IP_HEADER: "x-forwarded-for",
    AUTH_TRUSTED_PROXIES: "10.0.0.0/8",
    PAYMENTS_MODE: "free",
    ...overrides,
  };
}

function placeSearchOf(overrides: Record<string, unknown>) {
  return validateEnvironment(developmentVariables(overrides)).PLACE_SEARCH;
}

function productionPlaceSearchOf(overrides: Record<string, unknown> = {}) {
  return validateEnvironment(productionVariables(overrides)).PLACE_SEARCH;
}

describe("place search settings (S2)", () => {
  it("defaults to photon in development and production, and to off in tests", () => {
    assert.deepEqual(placeSearchOf({}), {
      provider: "photon",
      photonUrl: "https://photon.komoot.io/api/",
    });
    assert.equal(productionPlaceSearchOf().provider, "photon");
    // A test run must never call a geocoder, so the default protects every suite and every CI job.
    assert.equal(placeSearchOf({ NODE_ENV: "test" }).provider, "off");
  });

  it("reads the provider when it is set, in either environment", () => {
    assert.equal(placeSearchOf({ PLACE_SEARCH_PROVIDER: "off" }).provider, "off");
    assert.equal(
      placeSearchOf({ NODE_ENV: "test", PLACE_SEARCH_PROVIDER: "photon" }).provider,
      "photon",
    );
  });

  it("refuses a provider that is neither photon nor off, without echoing it", () => {
    for (const value of ["nominatim", "PHOTON", "true", "google"]) {
      assert.throws(
        () => validateEnvironment(developmentVariables({ PLACE_SEARCH_PROVIDER: value })),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "PLACE_SEARCH_PROVIDER must be photon or off.");
          return true;
        },
        value,
      );
    }
  });

  it("takes the instance from PLACE_SEARCH_PHOTON_URL, so a self-hosted Photon is a configuration change", () => {
    assert.equal(
      placeSearchOf({ PLACE_SEARCH_PHOTON_URL: "https://photon.example.test/api/" }).photonUrl,
      "https://photon.example.test/api/",
    );
    assert.equal(
      placeSearchOf({ NODE_ENV: "test", PLACE_SEARCH_PHOTON_URL: "http://127.0.0.1:2322/api/" })
        .photonUrl,
      "http://127.0.0.1:2322/api/",
    );
  });

  it("refuses a Photon URL that is not an http or https address, without echoing it", () => {
    for (const value of [
      "not-a-url",
      "ftp://photon.example.test/api/",
      "https://photon.example.test/api/?q=leak",
      "https://user:secret@photon.example.test/api/",
    ]) {
      assert.throws(
        () => validateEnvironment(developmentVariables({ PLACE_SEARCH_PHOTON_URL: value })),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error.message,
            "PLACE_SEARCH_PHOTON_URL must be an http or https URL without credentials, query, or fragment.",
          );
          return true;
        },
        value,
      );
    }
  });
});
