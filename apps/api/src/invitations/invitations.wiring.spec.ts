import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { CATALOG_PUBLIC_READER } from "../catalog/application/public/catalog-public-reader";
import { PrismaService } from "../database/prisma.service";
import { INVITATION_REPOSITORY } from "./application/invitation.repository";
import {
  ArchiveInvitationUseCase,
  CreateInvitationDraftUseCase,
  GetOwnInvitationUseCase,
  ListOwnInvitationsUseCase,
  UpdateInvitationContentUseCase,
} from "./application/invitation.use-cases";
import { INVITATION_CATALOG } from "./application/invitation-catalog";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { InvitationsModule } from "./invitations.module";
import { InvitationsController } from "./presentation/invitations.controller";

// InvitationsModule composition (M4 T3 and T4; S1, S3, S6, S7, S9): every use case is provided and bound to the
// Prisma repository and to the catalog's exported public reader, the module registers the `/invitations`
// controller, and `AppModule` registers the whole module, so the routes exist behind the global guard. A Prisma
// stub stands in for the database, so the suite never connects to one; no adapter is exercised here.

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

@Module({ imports: [StubDatabaseModule, InvitationsModule] })
class InvitationsTestModule {}

describe("InvitationsModule wiring", () => {
  it("provides every use case bound to the Prisma repository and the catalog public reader", async () => {
    const context = await NestFactory.createApplicationContext(InvitationsTestModule, {
      logger: false,
      abortOnError: false,
    });

    try {
      for (const useCase of [
        CreateInvitationDraftUseCase,
        ListOwnInvitationsUseCase,
        GetOwnInvitationUseCase,
        UpdateInvitationContentUseCase,
        ArchiveInvitationUseCase,
      ]) {
        assert.ok(context.get(useCase) instanceof useCase, useCase.name);
      }

      assert.ok(
        context.get(INVITATION_REPOSITORY, { strict: false }) instanceof PrismaInvitationRepository,
      );
      // The catalog's own public reader is what the invitations adapter delegates to: the cross-module
      // boundary is the catalog contract, not a catalog repository (module-template.md).
      assert.ok(context.get(CATALOG_PUBLIC_READER, { strict: false }) !== undefined);
      assert.ok(
        context.get(INVITATION_CATALOG, { strict: false }) instanceof CatalogInvitationReader,
      );
    } finally {
      await context.close();
    }
  });

  it("registers the invitations controller", () => {
    const controllers: unknown = Reflect.getMetadata("controllers", InvitationsModule) ?? [];

    assert.deepEqual(controllers, [InvitationsController]);
  });
});

describe("AppModule invitation wiring", () => {
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

  it("serves every /invitations route behind the guard", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const routes: Array<[string, string, unknown?]> = [
      ["POST", "/invitations", { templateVersionId: id, packageId: id }],
      ["GET", "/invitations"],
      ["GET", `/invitations/${id}`],
      ["PUT", `/invitations/${id}/content`, { content: {} }],
      ["POST", `/invitations/${id}/archive`],
    ];

    for (const [method, path, body] of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      // 401, not 404: the route is registered and the guard refuses it, before any body is validated.
      assert.equal(response.status, 401, `${method} ${path}`);
    }

    // A route nobody registered still answers 404, so the assertions above are not a catch-all.
    assert.equal((await fetch(`${baseUrl}/invitations-unknown`)).status, 404);
  });
});
