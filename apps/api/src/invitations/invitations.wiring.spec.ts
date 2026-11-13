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
  GetPublicInvitationUseCase,
  ListOwnInvitationsUseCase,
  PublishInvitationUseCase,
  UnpublishInvitationUseCase,
  UpdateInvitationContentUseCase,
  UpdateInvitationFeaturesUseCase,
} from "./application/invitation.use-cases";
import { INVITATION_CATALOG } from "./application/invitation-catalog";
import { INVITATION_PAYMENT_GATE } from "./application/invitation-payment-gate";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { NoPaymentRequiredGate } from "./infrastructure/no-payment-required";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { InvitationsModule } from "./invitations.module";
import { InvitationsController } from "./presentation/invitations.controller";
import { PublicInvitationsController } from "./presentation/public-invitations.controller";

// InvitationsModule composition (M4 T3 and T4 and M5 T3; S1, S2, S3, S6, S7, S9): every use case is provided
// and bound to the Prisma repository, to the catalog's exported public reader, and to the payment gate, the
// module registers the `/invitations` controller, and `AppModule` registers the whole module, so the routes
// exist behind the global guard. A Prisma stub stands in for the database, so the suite never connects to one;
// no adapter is exercised here.

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

@Module({ imports: [StubDatabaseModule, InvitationsModule] })
class InvitationsTestModule {}

describe("InvitationsModule wiring", () => {
  it("provides every use case bound to the Prisma repository, the catalog public reader, and the payment gate", async () => {
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
        UpdateInvitationFeaturesUseCase,
        ArchiveInvitationUseCase,
        PublishInvitationUseCase,
        UnpublishInvitationUseCase,
        GetPublicInvitationUseCase,
      ]) {
        assert.ok(context.get(useCase) instanceof useCase, useCase.name);
      }

      assert.ok(
        context.get(INVITATION_REPOSITORY, { strict: false }) instanceof PrismaInvitationRepository,
      );
      // The catalog's own public reader is what the invitations adapter delegates to: the cross-module
      // boundary is the catalog contract, not a catalog repository (module-template.md).
      const catalog: unknown = context.get(CATALOG_PUBLIC_READER, { strict: false });
      assert.ok(catalog !== undefined);
      // The public read needs the rendering facet of the same contract (M5 T3; A1, A3).
      assert.equal(
        typeof (catalog as { findVersionRenderData?: unknown }).findVersionRenderData,
        "function",
      );
      assert.equal(
        typeof (catalog as { isRendererRegistered?: unknown }).isRendererRegistered,
        "function",
      );
      assert.ok(
        context.get(INVITATION_CATALOG, { strict: false }) instanceof CatalogInvitationReader,
      );
      // Milestone 7 swaps only this provider, so publication is free today (S6).
      assert.ok(
        context.get(INVITATION_PAYMENT_GATE, { strict: false }) instanceof NoPaymentRequiredGate,
      );
    } finally {
      await context.close();
    }
  });

  it("registers the owner and the public invitation controllers", () => {
    const controllers: unknown = Reflect.getMetadata("controllers", InvitationsModule) ?? [];

    assert.deepEqual(controllers, [InvitationsController, PublicInvitationsController]);
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
      [
        "PUT",
        `/invitations/${id}/features`,
        { timeZone: "America/Mexico_City", whatsappPhone: null },
      ],
      ["POST", `/invitations/${id}/archive`],
      ["POST", `/invitations/${id}/publish`],
      ["POST", `/invitations/${id}/unpublish`],
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

  it("lets an anonymous request reach the public invitation route", async () => {
    // The guard never reads a session here: a request without one is not refused. The StubDatabaseModule
    // cannot answer the read, so the status is whatever the wired adapter reports; what this asserts is that
    // the route exists and is public, not what a real database would answer.
    const response = await fetch(`${baseUrl}/public/invitations/invitacion-abcdef`);

    assert.notEqual(response.status, 401, "the public route is not behind the session guard");
    assert.notEqual(response.status, 403);
    assert.notEqual(response.status, 404, "the route is registered");
  });
});
