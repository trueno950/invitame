import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { createConfigModule } from "../config/config.module";
import { EmailDeliveryService } from "./application/email-delivery.service";
import { EMAIL_SENDER } from "./application/email-sender.port";
import { EmailModule } from "./email.module";
import { InMemoryEmailSender } from "./infrastructure/in-memory-email-sender";
import { MailpitEmailSender } from "./infrastructure/mailpit-email-sender";
import { ResendEmailSender } from "./infrastructure/resend-email-sender";

// Composition only: an explicit environment selects the adapter bound to the port. No adapter sends here.

function baseEnvironment(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_BASE_URL: "http://localhost:3000",
    // M8 S4: production has no local media driver, so a valid production environment names its bucket.
    MEDIA_STORAGE_DRIVER: "s3",
    MEDIA_PUBLIC_BASE_URL: "https://api.example.test",
    MEDIA_S3_ENDPOINT: "https://account.r2.example.test",
    MEDIA_S3_REGION: "auto",
    MEDIA_S3_BUCKET: "invitame-media",
    MEDIA_S3_ACCESS_KEY_ID: "test-access-key-id",
    MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-access-key",
    ...overrides,
  };
}

async function resolveSender(environment: Record<string, unknown>): Promise<unknown> {
  @Module({ imports: [createConfigModule(environment), EmailModule] })
  class EmailTestModule {}

  const context = await NestFactory.createApplicationContext(EmailTestModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    assert.ok(context.get(EmailDeliveryService) instanceof EmailDeliveryService);
    return context.get(EMAIL_SENDER, { strict: false });
  } finally {
    await context.close();
  }
}

describe("EmailModule", () => {
  it("binds the in-memory adapter in test", async () => {
    assert.ok(
      (await resolveSender(baseEnvironment({ NODE_ENV: "test" }))) instanceof InMemoryEmailSender,
    );
  });

  it("binds the local mail catcher in development", async () => {
    const sender = await resolveSender(baseEnvironment({ NODE_ENV: "development" }));

    assert.ok(sender instanceof MailpitEmailSender);
    assert.equal(sender.endpoint, "http://localhost:8025/api/v1/send");
  });

  it("binds Resend when it is configured", async () => {
    const sender = await resolveSender(
      baseEnvironment({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://app.example.test",
        AUTH_BASE_URL: "https://app.example.test",
        EMAIL_FROM: "InvitaMe <no-reply@example.test>",
        RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
        AUTH_CLIENT_IP_HEADER: "x-forwarded-for",
        AUTH_PROXY_SECRET: randomBytes(32).toString("base64url"),
        INVITATION_ACCESS_SECRET: randomBytes(32).toString("base64url"),
        // M7 S4: production names its payment mode explicitly; this suite charges nothing.
        PAYMENTS_MODE: "free",
      }),
    );

    assert.ok(sender instanceof ResendEmailSender);
    assert.equal(sender.endpoint, "https://api.resend.com/emails");
  });
});
