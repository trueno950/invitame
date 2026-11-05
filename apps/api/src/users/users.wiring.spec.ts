import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";

// UsersModule wiring in AppModule (M2 T6b; S1, S9): the own profile routes exist and sit behind the
// global guard. A Prisma stub stands in for the database, so the suite never connects to one.

@Global()
@Module({
  // An anonymous request never reaches the database: the guard finds no session cookie.
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

describe("AppModule own profile wiring", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    app = await createApp(
      AppModule.forRoot({
        environment: {
          NODE_ENV: "test",
          CORS_ORIGIN: "http://localhost:3000",
          // Syntactically valid and never connected: the stub replaces the Prisma client.
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          AUTH_BASE_URL: "http://localhost:3001",
        },
        database: StubDatabaseModule,
      }),
      { logger: false, abortOnError: false },
    );
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  it("serves the own profile routes only behind the guard", async () => {
    for (const method of ["GET", "PATCH"]) {
      const response = await fetch(`${baseUrl}/me`, {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "PATCH" ? { body: JSON.stringify({ displayName: "Ana" }) } : {}),
      });

      // 401, not 404: the route is registered and the guard refuses it.
      assert.equal(response.status, 401, method);
    }
  });
});
