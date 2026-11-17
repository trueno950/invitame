import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { type MediaEnvironment, validateEnvironment } from "./environment";

// Invitation media configuration (M8 S4). Development and test need no new variable at all, so the running dev
// server keeps starting; production fails closed without a bucket, and the local driver is refused there because
// an ephemeral filesystem would lose the photos. No message ever echoes a credential.

const SECRET = randomBytes(24).toString("base64url");
const ACCESS_KEY_ID = `AKIA${randomBytes(8).toString("hex").toUpperCase()}`;

function environmentWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const environment: Record<string, unknown> = {
    NODE_ENV: "test",
    PORT: "3001",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://invitame:invitame@localhost:5432/invitame",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_BASE_URL: "http://localhost:3000",
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

function s3Variables(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    MEDIA_STORAGE_DRIVER: "s3",
    MEDIA_S3_ENDPOINT: "https://account.r2.example.test",
    MEDIA_S3_REGION: "auto",
    MEDIA_S3_BUCKET: "invitame-media",
    MEDIA_S3_ACCESS_KEY_ID: ACCESS_KEY_ID,
    MEDIA_S3_SECRET_ACCESS_KEY: SECRET,
    MEDIA_S3_FORCE_PATH_STYLE: "false",
    ...overrides,
  };
}

function productionVariables(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return environmentWith({
    NODE_ENV: "production",
    CORS_ORIGIN: "https://app.example.test",
    AUTH_BASE_URL: "https://app.example.test",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    EMAIL_TRANSPORT: "resend",
    EMAIL_FROM: "InvitaMe <no-reply@example.test>",
    RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
    AUTH_CLIENT_IP_HEADER: "x-real-ip",
    AUTH_PROXY_SECRET: randomBytes(32).toString("base64url"),
    MEDIA_PUBLIC_BASE_URL: "https://api.example.test",
    ...s3Variables(),
    ...overrides,
  });
}

function media(overrides: Record<string, unknown>): MediaEnvironment {
  return validateEnvironment(environmentWith(overrides)).MEDIA;
}

describe("media environment (M8 S4)", () => {
  it("defaults to the local driver with a gitignored directory and a development base URL", () => {
    const configured = media({});

    assert.equal(configured.driver, "local");
    assert.equal(configured.publicBaseUrl, "http://localhost:3001");
    if (configured.driver === "local") {
      assert.match(configured.directory, /apps\/api\/\.local-media$/);
    }
  });

  it("reads an explicit local directory and base URL", () => {
    const configured = media({
      MEDIA_LOCAL_DIRECTORY: "/tmp/invitame-media-tests",
      MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
    });

    assert.equal(configured.driver, "local");
    assert.equal(configured.publicBaseUrl, "https://media.example.test");
    if (configured.driver === "local") {
      assert.equal(configured.directory, "/tmp/invitame-media-tests");
    }
  });

  it("accepts the complete S3 configuration and parses the path-style flag", () => {
    const configured = media(s3Variables({ MEDIA_S3_FORCE_PATH_STYLE: "true" }));

    assert.equal(configured.driver, "s3");
    if (configured.driver === "s3") {
      assert.deepEqual(configured.s3, {
        endpoint: "https://account.r2.example.test",
        region: "auto",
        bucket: "invitame-media",
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET,
        forcePathStyle: true,
      });
    }
  });

  it("defaults the path-style flag to false and refuses anything but true or false", () => {
    const configured = media(s3Variables({ MEDIA_S3_FORCE_PATH_STYLE: undefined }));
    assert.equal(configured.driver === "s3" && configured.s3.forcePathStyle, false);

    assert.throws(() => media(s3Variables({ MEDIA_S3_FORCE_PATH_STYLE: "yes" })), {
      message: "MEDIA_S3_FORCE_PATH_STYLE must be true or false.",
    });
  });

  it("refuses every missing S3 variable by name, without echoing a value", () => {
    for (const name of [
      "MEDIA_S3_ENDPOINT",
      "MEDIA_S3_REGION",
      "MEDIA_S3_BUCKET",
      "MEDIA_S3_ACCESS_KEY_ID",
      "MEDIA_S3_SECRET_ACCESS_KEY",
    ]) {
      assert.throws(() => media(s3Variables({ [name]: undefined })), {
        message: `${name} must be provided.`,
      });
    }
  });

  it("refuses an invalid S3 region, bucket, or endpoint", () => {
    assert.throws(() => media(s3Variables({ MEDIA_S3_REGION: "us east 1" })), {
      message: "MEDIA_S3_REGION must be a region name such as us-east-1 or auto.",
    });
    assert.throws(() => media(s3Variables({ MEDIA_S3_BUCKET: "Not_A_Bucket" })), {
      message: "MEDIA_S3_BUCKET must be a valid bucket name.",
    });
    assert.throws(() => media(s3Variables({ MEDIA_S3_ENDPOINT: "account.r2.example.test" })), {
      message: "MEDIA_S3_ENDPOINT must be a valid HTTP origin.",
    });
  });

  it("refuses an unknown driver", () => {
    assert.throws(() => media({ MEDIA_STORAGE_DRIVER: "gcs" }), {
      message: "MEDIA_STORAGE_DRIVER must be local or s3.",
    });
  });

  it("refuses the local driver in production, which is the development and test default", () => {
    assert.throws(
      () => validateEnvironment(productionVariables({ MEDIA_STORAGE_DRIVER: "local" })),
      { message: "MEDIA_STORAGE_DRIVER must be s3 in production." },
    );
    assert.equal(validateEnvironment(environmentWith({})).MEDIA.driver, "local");
  });

  it("requires a configured bucket in production and an https public base URL", () => {
    assert.throws(
      () =>
        validateEnvironment(
          productionVariables({ MEDIA_S3_ENDPOINT: undefined, MEDIA_STORAGE_DRIVER: "s3" }),
        ),
      { message: "MEDIA_S3_ENDPOINT must be provided." },
    );
    assert.throws(
      () =>
        validateEnvironment(
          productionVariables({ MEDIA_PUBLIC_BASE_URL: "http://api.example.test" }),
        ),
      { message: "MEDIA_PUBLIC_BASE_URL must use HTTPS in production." },
    );
    assert.throws(
      () =>
        validateEnvironment(productionVariables({ MEDIA_S3_ENDPOINT: "http://minio.internal" })),
      { message: "MEDIA_S3_ENDPOINT must use HTTPS in production." },
    );
    assert.equal(validateEnvironment(productionVariables()).MEDIA.driver, "s3");
  });

  it("never echoes a credential in an error message", () => {
    for (const overrides of [
      { MEDIA_S3_SECRET_ACCESS_KEY: "" },
      { MEDIA_S3_FORCE_PATH_STYLE: SECRET },
      { MEDIA_S3_BUCKET: SECRET },
    ]) {
      assert.throws(
        () => media(s3Variables(overrides)),
        (error: unknown) => error instanceof Error && !error.message.includes(SECRET),
      );
    }
  });
});
