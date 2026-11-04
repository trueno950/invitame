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
    AUTH_BASE_URL: "http://localhost:3001",
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
        EMAIL_FROM: "InvitaMe <no-reply@example.test>",
        RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
      }),
    );

    assert.ok(sender instanceof ResendEmailSender);
    assert.equal(sender.endpoint, "https://api.resend.com/emails");
  });
});
