import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Body, Controller, Get, HttpCode, Module, Post } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { IsInt, IsString, Max, MaxLength, Min } from "class-validator";

import { createApp } from "../app.setup";
import { createConfigModule } from "../config/config.module";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { Public } from "./access-control/access-control";
import { AccessControlModule } from "./access-control/access-control.module";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

const AUTH_BASE_PATH = "/api/auth";
const TEST_ORIGIN = "http://localhost:3000";
// Fixed origin: the listening port is ephemeral and unknown until after the module is built.
// Better Auth uses baseURL only to build absolute URLs, which these probes never follow.
const TEST_AUTH_BASE_URL = "http://localhost:3001";

class ProbeInputDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}

@Controller("probe")
class ProbeController {
  @Post("public")
  @Public()
  @HttpCode(200)
  acceptPublic(@Body() input: ProbeInputDto): { name: string; quantity: number } {
    return { name: input.name, quantity: input.quantity };
  }

  @Post("protected")
  @HttpCode(200)
  acceptProtected(@Body() input: ProbeInputDto): { name: string } {
    return { name: input.name };
  }

  @Get("protected")
  readProtected(): { ok: true } {
    return { ok: true };
  }
}

describe("Better Auth through @thallesp/nestjs-better-auth integration", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    const secret = randomBytes(32).toString("base64url");
    const auth = createAuth({
      secret,
      baseURL: TEST_AUTH_BASE_URL,
      trustedOrigins: [TEST_ORIGIN],
      // Rate limits run in every environment and persist through this adapter.
      database: memoryAdapter({ rateLimit: [] }),
      // No probe here requests a sign-in code; the in-memory sender keeps the suite offline.
      signInCodes: new SignInCodeSender(
        new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
        new BackgroundTasks(() => {}),
      ),
      clientIp: { header: "x-forwarded-for", trustedProxies: [] },
      requireClientIp: false,
      log: () => {},
    });

    // Explicit configuration: the shared createApp boundary reads trusted origins from it and the
    // suite never reads apps/api/.env.
    @Module({
      imports: [
        createConfigModule({
          CORS_ORIGIN: TEST_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL: TEST_AUTH_BASE_URL,
        }),
        // The runtime composition: the project-owned guard replaces the integration's (M2 T6a).
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
      ],
      controllers: [ProbeController],
    })
    class AuthIntegrationTestModule {}

    app = await createApp(AuthIntegrationTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app?.close();
  });

  function postJson(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("emits DTO decorator metadata under the test runner, as the tsc build does", () => {
    for (const method of ["acceptPublic", "acceptProtected"]) {
      assert.deepEqual(
        Reflect.getMetadata("design:paramtypes", ProbeController.prototype, method),
        [ProbeInputDto],
      );
    }
  });

  it("serves the Better Auth health endpoint under the integration mount path", async () => {
    const response = await fetch(`${baseUrl}${AUTH_BASE_PATH}/ok`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it("delivers the JSON request body to the Better Auth handler", async () => {
    // Intent: with Nest's body parser disabled, PROVIDER_NOT_FOUND proves the handler still
    // received and parsed `provider` from the body rather than rejecting an empty request.
    const response = await postJson(`${AUTH_BASE_PATH}/sign-in/social`, {
      provider: "not-configured",
      callbackURL: "/",
    });
    const body = (await response.json()) as { code?: string };

    assert.equal(response.status, 404);
    assert.equal(body.code, "PROVIDER_NOT_FOUND");
  });

  it("parses and accepts a valid JSON body on a non-auth route", async () => {
    const response = await postJson("/probe/public", { name: "Ana", quantity: 3 });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { name: "Ana", quantity: 3 });
  });

  it("rejects a wrongly typed property with 400 through the global ValidationPipe", async () => {
    const response = await postJson("/probe/public", { name: "Ana", quantity: "three" });
    const body = (await response.json()) as { statusCode: number; message: string[] };

    assert.equal(response.status, 400);
    assert.equal(body.statusCode, 400);
    assert.ok(body.message.some((message) => message.startsWith("quantity must")));
  });

  it("rejects a non-whitelisted property with 400 through the global ValidationPipe", async () => {
    const response = await postJson("/probe/public", { name: "Ana", quantity: 3, role: "admin" });
    const body = (await response.json()) as { statusCode: number; message: string[] };

    assert.equal(response.status, 400);
    assert.deepEqual(body.message, ["property role should not exist"]);
  });

  it("requires a session on undecorated routes through the project-owned global guard", async () => {
    const getResponse = await fetch(`${baseUrl}/probe/protected`);
    assert.equal(getResponse.status, 401);

    const postResponse = await postJson("/probe/protected", { name: "Ana", quantity: 3 });
    assert.equal(postResponse.status, 401);
  });

  it("denies an unauthenticated request before validating its body", async () => {
    const response = await postJson("/probe/protected", { quantity: "three", role: "admin" });

    assert.equal(response.status, 401);
  });

  it("keeps helmet security headers on Nest routes and Better Auth routes", async () => {
    const responses = await Promise.all([
      postJson("/probe/public", { name: "Ana", quantity: 3 }),
      fetch(`${baseUrl}${AUTH_BASE_PATH}/ok`),
    ]);

    for (const response of responses) {
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.ok(response.headers.get("content-security-policy"));
      assert.equal(response.headers.get("x-powered-by"), null);
    }
  });
});
