import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthService } from "@thallesp/nestjs-better-auth";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { CATALOG_PUBLIC_READER } from "../catalog/application/public/catalog-public-reader";
import { createConfigModule } from "../config/config.module";
import { PrismaService } from "../database/prisma.service";
import { PaymentGate } from "../payments/infrastructure/payment-gate";
import { GUEST_REPOSITORY } from "./application/guest.repository";
import {
  ADMIN_INVITATION_REPOSITORY,
  type AdminInvitationRepository,
} from "./application/admin-invitation.repository";
import {
  GetAdminInvitationUseCase,
  ListAdminInvitationsUseCase,
} from "./application/admin-invitation.use-cases";
import {
  INVITATION_MEDIA_COUNT_READER,
  type InvitationMediaCountReader,
} from "./application/invitation-media-counts";
import {
  INVITATION_OWNER_EMAIL_READER,
  type InvitationOwnerEmailReader,
} from "./application/invitation-owner-email";
import {
  INVITATION_PAYMENT_READER,
  type InvitationPaymentReader,
} from "./application/invitation-payment-summary";
import { INVITATION_REPOSITORY, type InvitationRecord } from "./application/invitation.repository";
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
import {
  CheckInGuestUseCase,
  CreateGuestUseCase,
  DeleteGuestUseCase,
  GetAttendanceExportUseCase,
  GetPublicGuestUseCase,
  ListGuestsUseCase,
  RotateGuestTokenUseCase,
  SubmitGuestRsvpUseCase,
  UpdateGuestUseCase,
} from "./application/invitation-guest.use-cases";
import {
  INVITATION_PAYMENT_GATE,
  type InvitationPaymentGate,
} from "./application/invitation-payment-gate";
import {
  ClearInvitationPlaceUseCase,
  SearchPlacesUseCase,
  UpdateInvitationPlaceUseCase,
} from "./application/invitation-place.use-cases";
import {
  GetRsvpResponsesUseCase,
  SubmitPublicRsvpUseCase,
  UpdateRsvpSettingsUseCase,
} from "./application/invitation-rsvp.use-cases";
import { MUSIC_METADATA_PROVIDER, type MusicMetadataProvider } from "./application/music-metadata";
import { NO_PLACE_SEARCH, PLACE_SEARCH } from "./application/place-search";
import { InMemoryPlaceSearchCache } from "./application/place-search-cache";
import {
  PLACE_SEARCH_RATE_LIMITER,
  type PlaceSearchRateLimiter,
} from "./application/place-search-rate-limiter";
import { RSVP_REPOSITORY } from "./application/rsvp.repository";
import { RSVP_RATE_LIMITER } from "./application/rsvp-rate-limiter";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { PrismaAdminInvitationRepository } from "./infrastructure/prisma-admin-invitation.repository";
import { PrismaGuestRepository } from "./infrastructure/prisma-guest.repository";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { PrismaPlaceSearchRateLimiter } from "./infrastructure/prisma-place-search-rate-limiter";
import { PrismaRsvpRepository } from "./infrastructure/prisma-rsvp.repository";
import { PrismaRsvpRateLimiter } from "./infrastructure/prisma-rsvp-rate-limiter";
import { InvitationsModule } from "./invitations.module";
import { AdminInvitationsController } from "./presentation/admin-invitations.controller";
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

/**
 * The real `AuthModule` is global when the application registers it (M8 S4): the media serving route reads an
 * optional session for a draft's owner. This stub stands in for it so the invitations module is exercised alone.
 */
@Global()
@Module({
  providers: [
    {
      provide: AuthService,
      useValue: { api: { getSession: async () => null } },
    },
  ],
  exports: [AuthService],
})
class StubAuthModule {}

@Module({
  imports: [
    // The public controller reads the configured client-IP header for the per-address RSVP rate limit.
    createConfigModule({
      NODE_ENV: "test",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      AUTH_BASE_URL: "http://localhost:3000",
    }),
    StubDatabaseModule,
    StubAuthModule,
    InvitationsModule,
  ],
})
class InvitationsTestModule {}

/** The stored row a gate is asked about: `free` mode answers without reading any field. */
function invitationRecord(): InvitationRecord {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    ownerId: "00000000-0000-4000-8000-000000000001",
    templateVersionId: "00000000-0000-4000-8000-000000000002",
    packageId: "00000000-0000-4000-8000-000000000003",
    slug: "invitacion-abcdef",
    status: "DRAFT",
    content: {},
    timeZone: "America/Mexico_City",
    whatsappPhone: null,
    playlistUrl: null,
    rsvpDeadline: null,
    rsvpPartyLimit: 4,
    archivedAt: null,
    publishedAt: null,
    firstPublishedAt: null,
    expiresAt: null,
    createdAt: new Date("2026-11-21T10:00:00.000Z"),
    updatedAt: new Date("2026-11-21T10:00:00.000Z"),
  };
}

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
        UpdateRsvpSettingsUseCase,
        GetRsvpResponsesUseCase,
        SubmitPublicRsvpUseCase,
        ListGuestsUseCase,
        CreateGuestUseCase,
        UpdateGuestUseCase,
        DeleteGuestUseCase,
        RotateGuestTokenUseCase,
        GetPublicGuestUseCase,
        SubmitGuestRsvpUseCase,
        CheckInGuestUseCase,
        GetAttendanceExportUseCase,
        SearchPlacesUseCase,
        UpdateInvitationPlaceUseCase,
        ClearInvitationPlaceUseCase,
        ListAdminInvitationsUseCase,
        GetAdminInvitationUseCase,
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
      // Milestone 7 moves the gate to the payments module, which binds it for the mode the environment names
      // (S3, S4). This test module sets no `PAYMENTS_MODE`, so it runs `free` and publication stays free.
      const paymentGate = context.get<InvitationPaymentGate>(INVITATION_PAYMENT_GATE, {
        strict: false,
      });
      assert.ok(paymentGate instanceof PaymentGate);
      assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationRecord()), {
        required: false,
      });
      // The administrator's status view (M9 T2; S1) binds its own global read port, separate from the owner-scoped
      // repository, and asks the three facets through the ports the payments, media, and users modules implement.
      assert.ok(
        context.get(ADMIN_INVITATION_REPOSITORY, { strict: false }) instanceof
          PrismaAdminInvitationRepository,
      );
      assert.ok(context.get(INVITATION_PAYMENT_READER, { strict: false }) !== undefined);
      assert.ok(
        (
          context.get<InvitationPaymentReader>(INVITATION_PAYMENT_READER, { strict: false }) as {
            latestFor?: unknown;
          }
        ).latestFor instanceof Function,
      );
      assert.ok(context.get(INVITATION_MEDIA_COUNT_READER, { strict: false }) !== undefined);
      assert.ok(
        (
          context.get<InvitationMediaCountReader>(INVITATION_MEDIA_COUNT_READER, {
            strict: false,
          }) as { countsFor?: unknown }
        ).countsFor instanceof Function,
      );
      const owners = context.get<InvitationOwnerEmailReader>(INVITATION_OWNER_EMAIL_READER, {
        strict: false,
      });
      assert.ok(owners !== undefined);
      // An empty page reads nothing: the port answers a batch, and the status view asks with the ids it has.
      assert.deepEqual(await owners.emailsFor([]), new Map());
      // The owner-scoped read is still its own binding: the two ports are not the same object.
      assert.ok(
        context.get<AdminInvitationRepository>(ADMIN_INVITATION_REPOSITORY, {
          strict: false,
        }) !== context.get(INVITATION_REPOSITORY, { strict: false }),
      );
      // RSVP data and its rate limit have their own adapters, both on the shared Prisma client (M6 G1; S4).
      assert.ok(context.get(RSVP_REPOSITORY, { strict: false }) instanceof PrismaRsvpRepository);
      assert.ok(context.get(RSVP_RATE_LIMITER, { strict: false }) instanceof PrismaRsvpRateLimiter);
      // The guest list has its own adapter on the same Prisma client (M6 G2; S1, S4).
      assert.ok(context.get(GUEST_REPOSITORY, { strict: false }) instanceof PrismaGuestRepository);
      // The music metadata port is bound for the lookup setting the configuration validated (S2). This test module
      // runs `NODE_ENV=test`, whose default is `off`, so the bound adapter answers nothing and reaches no network.
      const music = context.get<MusicMetadataProvider>(MUSIC_METADATA_PROVIDER, { strict: false });
      assert.ok(music !== undefined);
      assert.equal(await music.lookup("https://open.spotify.com/playlist/abc", "spotify"), null);
      // The place search port is bound for the provider the configuration validated (S2): this module runs
      // `NODE_ENV=test`, whose default is `off`, so typing an address asks nobody.
      assert.equal(context.get(PLACE_SEARCH, { strict: false }), NO_PLACE_SEARCH);
      assert.ok(
        context.get<PlaceSearchRateLimiter>(PLACE_SEARCH_RATE_LIMITER, { strict: false }) instanceof
          PrismaPlaceSearchRateLimiter,
      );
      assert.ok(
        context.get(InMemoryPlaceSearchCache, { strict: false }) instanceof
          InMemoryPlaceSearchCache,
      );
    } finally {
      await context.close();
    }
  });

  it("registers the owner and the public invitation controllers", () => {
    const controllers: unknown = Reflect.getMetadata("controllers", InvitationsModule) ?? [];

    assert.deepEqual(controllers, [
      InvitationsController,
      PublicInvitationsController,
      AdminInvitationsController,
    ]);
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
      ["PUT", `/invitations/${id}/rsvp-settings`, { deadline: null, partyLimit: 4 }],
      ["GET", `/invitations/${id}/rsvp`],
      ["GET", `/invitations/${id}/rsvp.csv`],
      ["GET", `/invitations/${id}/places/search?q=quer%C3%A9taro`],
      [
        "PUT",
        `/invitations/${id}/places/address`,
        { label: "Parroquia de San José", lat: 20.5888, lng: -100.3899 },
      ],
      ["DELETE", `/invitations/${id}/places/address`],
      ["GET", `/invitations/${id}/guests`],
      ["POST", `/invitations/${id}/guests`, { name: "Ana", seats: 2, phone: null, note: null }],
      [
        "PUT",
        `/invitations/${id}/guests/${id}`,
        { name: "Ana", seats: 2, phone: null, note: null },
      ],
      ["DELETE", `/invitations/${id}/guests/${id}`],
      ["POST", `/invitations/${id}/guests/${id}/token`],
      ["POST", `/invitations/${id}/guests/check-in`, { token: "A".repeat(22) }],
      // The administrator's status view (M9 T2; S1): behind the guard and `@AdminOnly()`.
      ["GET", "/admin/invitations?slug=boda&status=PUBLISHED&limit=10"],
      ["GET", `/admin/invitations/${id}`],
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

  it("lets an anonymous request reach the public invitation routes", async () => {
    // The guard never reads a session here: a request without one is not refused. The StubDatabaseModule
    // cannot answer the read, so the status is whatever the wired adapter reports; what this asserts is that
    // the routes exist and are public, not what a real database would answer.
    const routes: Array<[string, string]> = [
      ["GET", "/public/invitations/invitacion-abcdef"],
      ["POST", "/public/invitations/invitacion-abcdef/rsvp"],
      ["GET", "/public/invitations/invitacion-abcdef/guests/AAAAAAAAAAAAAAAAAAAAAA"],
      ["POST", "/public/invitations/invitacion-abcdef/guests/AAAAAAAAAAAAAAAAAAAAAA/rsvp"],
    ];

    for (const [method, path] of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "POST"
          ? { body: JSON.stringify({ name: "Ana", attending: true, partySize: 1 }) }
          : {}),
      });

      assert.notEqual(response.status, 401, `${method} ${path} is not behind the session guard`);
      assert.notEqual(response.status, 403);
      assert.notEqual(response.status, 404, `${method} ${path} is registered`);
    }
  });
});
