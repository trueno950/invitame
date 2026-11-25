import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";

// CatalogModule wiring in AppModule (M3 T6a to T6c, M4 T4, and T4; S1, S4, S8, S9, A5): the admin category,
// feature, package, template, version, and renderer routes, the creator catalog reads, and the landing's public
// price list, all exist; the administrator and creator routes sit behind the global guard, and the public one does
// not. A Prisma stub stands in for the database, so the suite never connects to one. The authorized behavior is
// proved in `taxonomy.controllers.spec.ts`, `creator/creator-catalog.controller.spec.ts`, and
// `public/public-catalog.controller.spec.ts`.

@Global()
@Module({
  // An anonymous request never reaches the database: the guard finds no session cookie. The landing's price list
  // is public and does reach it, so the stub answers the one query that read makes.
  providers: [
    {
      provide: PrismaService,
      useValue: { package: { findMany: async (): Promise<unknown[]> => [] } },
    },
  ],
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

  it("serves the admin catalog routes and the creator catalog reads only behind the guard", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/admin/catalog/categories"],
      ["POST", "/admin/catalog/categories", { key: "birthday", name: "Cumpleaños" }],
      ["PATCH", `/admin/catalog/categories/${id}`, { name: "Cumpleaños" }],
      ["GET", "/admin/catalog/features"],
      ["POST", "/admin/catalog/features", { key: "RSVP", name: "Confirmación" }],
      ["PATCH", `/admin/catalog/features/${id}`, { name: "Confirmación" }],
      ["GET", "/admin/catalog/packages"],
      ["POST", "/admin/catalog/packages", { key: "basic", name: "Básico" }],
      ["PATCH", `/admin/catalog/packages/${id}`, { status: "ACTIVE" }],
      ["PUT", `/admin/catalog/packages/${id}/features`, { featureIds: [] }],
      ["PUT", `/admin/catalog/packages/${id}/price`, { currency: "MXN", amountMinor: 100 }],
      ["GET", `/admin/catalog/packages/${id}/prices`],
      ["GET", "/admin/catalog/templates"],
      ["POST", "/admin/catalog/templates", { key: "adventure", name: "Aventura", categoryId: id }],
      ["PATCH", `/admin/catalog/templates/${id}`, { status: "ARCHIVED" }],
      ["GET", `/admin/catalog/templates/${id}/versions`],
      [
        "POST",
        `/admin/catalog/templates/${id}/versions`,
        { componentKey: "birthday-poster-01", schema: {}, configuration: {} },
      ],
      ["POST", `/admin/catalog/templates/${id}/versions/${id}/publish`],
      ["POST", `/admin/catalog/templates/${id}/versions/${id}/retire`],
      ["GET", "/admin/catalog/renderers"],
      // The creator catalog reads are signed-in, not public: the guard refuses them first (M4 T4, A5).
      ["GET", "/catalog/templates"],
      ["GET", "/catalog/packages"],
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

  it("serves the landing's public price list to an anonymous visitor (T4; S4)", async () => {
    const response = await fetch(`${baseUrl}/public/catalog/packages`);

    // 200, not 401 or 404: the route is registered and reads no session.
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
});
