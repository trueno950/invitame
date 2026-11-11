import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Global, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

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

// InvitationsModule composition (M4 T3; S1, S3, S6, S7, S9): every use case is provided and bound to the Prisma
// repository and to the catalog's exported public reader, and the module registers no controller, because the
// routes belong to M4 T4. A Prisma stub stands in for the database, so the suite never connects to one; no
// adapter is exercised here.

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

  it("registers no controller: the invitation routes arrive with M4 T4", () => {
    const controllers: unknown = Reflect.getMetadata("controllers", InvitationsModule) ?? [];

    assert.deepEqual(controllers, []);
  });
});
