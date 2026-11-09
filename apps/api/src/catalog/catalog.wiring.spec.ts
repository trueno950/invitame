import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";

// CatalogModule wiring in AppModule (M3 T6a; S1, S9): the admin category and feature routes exist and
// sit behind the global guard. A Prisma stub stands in for the database, so the suite never connects
// to one. The authorized behavior is proved in `taxonomy.controllers.spec.ts`.

@Global()
@Module({
  // An anonymous request never reaches the database: the guard finds no session cookie.
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

describe("AppModule catalog wiring", () => {
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
          AUTH_BASE_URL: "http://localhost:3000",
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

  it("serves the admin category and feature routes only behind the guard", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/admin/catalog/categories"],
      ["POST", "/admin/catalog/categories", { key: "birthday", name: "Cumpleaños" }],
      ["PATCH", `/admin/catalog/categories/${id}`, { name: "Cumpleaños" }],
      ["GET", "/admin/catalog/features"],
      ["POST", "/admin/catalog/features", { key: "RSVP", name: "Confirmación" }],
      ["PATCH", `/admin/catalog/features/${id}`, { name: "Confirmación" }],
    ];

    for (const [method, path, body] of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      // 401, not 404: the route is registered and the guard refuses it.
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });
});
