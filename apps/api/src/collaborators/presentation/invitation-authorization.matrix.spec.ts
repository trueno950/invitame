import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module, type Provider, type Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { MetadataScanner, Reflector } from "@nestjs/core";

import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import { toOwnedInvitation } from "../../invitations/application/invitation.use-cases";
import type { InvitationRecordWithMusic } from "../../invitations/application/invitation.repository";
import {
  ArchiveInvitationUseCase,
  CreateInvitationDraftUseCase,
  GetOwnInvitationUseCase,
  ListOwnInvitationsUseCase,
  PublishInvitationUseCase,
  UnpublishInvitationUseCase,
  UpdateInvitationContentUseCase,
  UpdateInvitationFeaturesUseCase,
} from "../../invitations/application/invitation.use-cases";
import {
  CheckInGuestUseCase,
  CreateGuestUseCase,
  DeleteGuestUseCase,
  GetAttendanceExportUseCase,
  ListGuestsUseCase,
  RotateGuestTokenUseCase,
  UpdateGuestUseCase,
} from "../../invitations/application/invitation-guest.use-cases";
import {
  ClearInvitationPlaceUseCase,
  SearchPlacesUseCase,
  UpdateInvitationPlaceUseCase,
} from "../../invitations/application/invitation-place.use-cases";
import {
  GetRsvpResponsesUseCase,
  UpdateRsvpSettingsUseCase,
} from "../../invitations/application/invitation-rsvp.use-cases";
import type { RsvpRead } from "../../invitations/application/invitation-rsvp.use-cases";
import {
  GetGuestbookEntriesUseCase,
  SetGuestbookEntryHiddenUseCase,
} from "../../invitations/application/invitation-guestbook.use-cases";
import type { GuestbookRead } from "../../invitations/application/invitation-guestbook.use-cases";
import {
  CheckInvitationSlugAvailabilityUseCase,
  RenameInvitationSlugUseCase,
} from "../../invitations/application/invitation-slug.use-cases";
import type {
  GuestListRead,
  GuestWithToken,
} from "../../invitations/application/invitation-guest.use-cases";
import { InvitationsController } from "../../invitations/presentation/invitations.controller";
import {
  DeleteMediaUseCase,
  ListOwnMediaUseCase,
  ReadOwnMediaLimitsUseCase,
  UpdateMediaUseCase,
  UploadMediaUseCase,
} from "../../media/application/media.use-cases";
import type { MediaAssetView } from "../../media/application/media.use-cases";
import {
  GetGuestAlbumUseCase,
  ReviewGuestPhotoUseCase,
} from "../../media/application/guest-album.use-cases";
import type { GuestAlbumRead } from "../../media/application/guest-album.use-cases";
import { InvitationsMediaController } from "../../media/presentation/invitations-media.controller";
import { InvitationsGuestAlbumController } from "../../media/presentation/invitations-guest-album.controller";
import {
  GetInvitationPaymentUseCase,
  StartCheckoutUseCase,
} from "../../payments/application/payment.use-cases";
import { InvitationPaymentsController } from "../../payments/presentation/invitation-payments.controller";
import type {
  InvitationCollaboratorRecord,
  InvitationCollaboratorRepository,
  InvitationInviteTarget,
} from "../application/collaborator.repository";
import {
  AcceptCollaborationUseCase,
  InviteCollaboratorUseCase,
  ListInvitationCollaboratorsUseCase,
  RevokeCollaboratorUseCase,
  UpdateCollaboratorPermissionsUseCase,
} from "../application/collaborator.use-cases";
import {
  INVITATION_ACCESS_RESOLVER,
  StoredInvitationAccessResolver,
} from "../application/invitation-access";
import type { InvitationPermission } from "../domain/invitation-collaborator";
import {
  CollaborationsController,
  InvitationsCollaboratorsController,
} from "../presentation/collaborators.controller";
import {
  InvitationAccessGuard,
  readInvitationRouteAccess,
} from "../presentation/invitation-access.guard";

// The authorization matrix of the invitation routes (F12; S2.12, L17.4, L17.6). Every owner route of this API — the
// invitation editor, the media and the guests' album, the guestbook, the RSVP answers, the guest list and its CSV, the
// places, the payments, and the collaborators themselves — runs through one guard, which asks one resolver who the caller
// is and then checks the permission the route declared. This suite proves that, at the HTTP boundary, for every
// registered invitation route, with the exact status each caller gets.
//
// How the columns are built: the routes are read from the controllers the test module registers, not from a hand-written
// list, so a route added later appears here on its own. A route that names an invitation (its path carries `:id`) and
// declares no permission fails the suite: the declaration IS the review, and the guard's default is denial.
//
// How the rows are built: the owner, one collaborator holding exactly one permission, one holding all three, one still
// pending, one revoked, a stranger, and an anonymous caller. The use cases here are stubs that answer a fixed, valid
// payload, so the suite observes the authorization decision and nothing else: the full behavior of each route is proved
// by that route's own suite (`invitations.controller.spec.ts`, `media.controller.spec.ts`,
// `guest-album.controller.spec.ts`, `payments.controller.spec.ts`, and the collaborators db-spec).

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const OWNER = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const CO_HOST_EMAIL = "cohost@example.test";

/** The three grantable permissions, exactly as the domain states them (L17.2). */
type Permission = InvitationPermission;

/** One caller the matrix tries. `grants` is what the stored collaborator row says, if any. */
interface MatrixRow {
  readonly name: string;
  readonly grants: readonly Permission[] | "ALL" | "PENDING" | "REVOKED" | "STRANGER" | "ANONYMOUS";
}

const ROWS: readonly MatrixRow[] = [
  { name: "the owner", grants: "ALL" },
  { name: "a collaborator with EDIT_CONTENT", grants: ["EDIT_CONTENT"] },
  { name: "a collaborator with VIEW_ATTENDANCE", grants: ["VIEW_ATTENDANCE"] },
  { name: "a collaborator with PUBLISH", grants: ["PUBLISH"] },
  { name: "a collaborator with all three", grants: "ALL" },
  { name: "a pending collaborator", grants: "PENDING" },
  { name: "a revoked collaborator", grants: "REVOKED" },
  { name: "a stranger", grants: "STRANGER" },
  { name: "an anonymous caller", grants: "ANONYMOUS" },
];

/** One registered route, with the fixture that makes it succeed for the owner. */
interface RouteFixture {
  /** The success status the owner (or an allowed collaborator) receives. */
  readonly success: number;
  readonly body?: unknown;
  /** A request body the route parses itself (the media upload), built as its own request. */
  readonly upload?: boolean;
}

/**
 * The concrete values the paths carry, so a fixture key can name `:assetId` while the request carries a uuid.
 */
const PARAMS: Record<string, string> = {
  id: INVITATION,
  guestId: "33333333-3333-4333-8333-333333333333",
  entryId: "44444444-4444-4444-8444-444444444444",
  assetId: "55555555-5555-4555-8555-555555555555",
  photoId: "66666666-6666-4666-8666-666666666666",
  collaboratorId: "77777777-7777-4777-8777-777777777777",
  field: "address",
};

/** One valid body per invitation-scoped route, keyed by `METHOD /path/with/:params`. */
const FIXTURES: Record<string, RouteFixture> = {
  "GET /invitations": { success: 200 },
  "POST /invitations": {
    success: 201,
    body: { templateVersionId: INVITATION, packageId: INVITATION },
  },
  "GET /invitations/:id": { success: 200 },
  "PUT /invitations/:id/content": { success: 200, body: { content: {} } },
  "PUT /invitations/:id/features": {
    success: 200,
    body: { timeZone: "America/Mexico_City", whatsappPhone: null, playlistUrl: null },
  },
  "GET /invitations/:id/places/search": { success: 200 },
  "GET /invitations/:id/slug-availability": { success: 200 },
  "PUT /invitations/:id/slug": { success: 200, body: { slug: "valentina-xv" } },
  "PUT /invitations/:id/places/:field": {
    success: 200,
    body: { label: "Parroquia de San José", lat: 20.5888, lng: -100.3899 },
  },
  "DELETE /invitations/:id/places/:field": { success: 200 },
  "POST /invitations/:id/archive": { success: 200 },
  "POST /invitations/:id/publish": { success: 200 },
  "POST /invitations/:id/unpublish": { success: 200 },
  "PUT /invitations/:id/rsvp-settings": { success: 200, body: { deadline: null, partyLimit: 4 } },
  "GET /invitations/:id/rsvp": { success: 200 },
  "GET /invitations/:id/guestbook": { success: 200 },
  "PUT /invitations/:id/guestbook/:entryId": { success: 200, body: { hidden: true } },
  "GET /invitations/:id/rsvp.csv": { success: 200 },
  "GET /invitations/:id/guests": { success: 200 },
  "POST /invitations/:id/guests": {
    success: 201,
    body: { name: "Ana", seats: 2, phone: null, note: null },
  },
  "PUT /invitations/:id/guests/:guestId": {
    success: 200,
    body: { name: "Ana", seats: 2, phone: null, note: null },
  },
  "DELETE /invitations/:id/guests/:guestId": { success: 200 },
  "POST /invitations/:id/guests/:guestId/token": { success: 200 },
  "POST /invitations/:id/guests/check-in": { success: 200, body: { token: "A".repeat(22) } },
  "POST /invitations/:id/media": { success: 201, upload: true },
  "GET /invitations/:id/media": { success: 200 },
  "GET /invitations/:id/media/limits": { success: 200 },
  "PATCH /invitations/:id/media/:assetId": { success: 200, body: { alt: "La foto principal" } },
  "DELETE /invitations/:id/media/:assetId": { success: 200 },
  "GET /invitations/:id/guest-photos": { success: 200 },
  "PATCH /invitations/:id/guest-photos/:photoId": { success: 200, body: { status: "PUBLISHED" } },
  "POST /invitations/:id/checkout": { success: 200 },
  "GET /invitations/:id/payment": { success: 200 },
  "GET /invitations/:id/collaborators": { success: 200 },
  "POST /invitations/:id/collaborators": {
    success: 201,
    body: { email: CO_HOST_EMAIL, permissions: ["PUBLISH"] },
  },
  "PATCH /invitations/:id/collaborators/:collaboratorId": {
    success: 200,
    body: { permissions: ["PUBLISH"] },
  },
  "DELETE /invitations/:id/collaborators/:collaboratorId": { success: 200 },
  "POST /collaborations/accept": { success: 200, body: { token: "B".repeat(22) } },
};

/**
 * The collaborator table as the resolver reads it (F12; L17.4): one possible row per account, whose state and
 * permissions this suite sets per case. `findInviteTarget` answers the invitation every fixture names.
 */
class MemoryCollaboratorRepository implements InvitationCollaboratorRepository {
  readonly rows = new Map<
    string,
    { permissions: Permission[]; accepted: boolean; revoked: boolean }
  >();
  /** The account the invitation belongs to, set once the suite created it. */
  ownerId = OWNER;

  seed(userId: string, grants: MatrixRow["grants"]): void {
    const permissions: Permission[] =
      grants === "ALL"
        ? ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"]
        : [...(grants as Permission[])];
    this.rows.set(userId, {
      permissions,
      accepted: grants !== "PENDING",
      revoked: grants === "REVOKED",
    });
  }

  async findInviteTarget(id: string): Promise<InvitationInviteTarget | null> {
    return id === INVITATION
      ? { id, ownerId: this.ownerId, includedFeatureKeys: ["CO_HOSTS"] }
      : null;
  }

  async acceptedAccess(id: string, userId: string): Promise<readonly Permission[] | null> {
    const row = this.rows.get(userId);
    if (id !== INVITATION || row === undefined || row.revoked || !row.accepted) {
      return null;
    }

    return row.permissions;
  }

  notUsed(): never {
    throw new Error("the authorization matrix never reads or writes a collaborator row");
  }

  listForOwner = async () => this.notUsed();
  create = async () => this.notUsed();
  updatePermissions = async () => this.notUsed();
  revoke = async () => this.notUsed();
  findAccountEmail = async () => CO_HOST_EMAIL;
  accept = async () => this.notUsed();
}

/** The stub a use case is overridden with: one fixed, valid answer, so the matrix observes authorization alone. */
function stub<T>(token: Type<unknown>, value: T): Provider {
  return { provide: token, useValue: { execute: async () => value } };
}

/** One stored invitation, mapped by the API's own projection so every stub answer has the documented shape. */
const RECORD: InvitationRecordWithMusic = {
  id: INVITATION,
  ownerId: OWNER,
  templateVersionId: "88888888-8888-4888-8888-888888888888",
  packageId: "99999999-9999-4999-8999-999999999999",
  slug: "valentina-xv",
  status: "DRAFT",
  content: {},
  timeZone: "America/Mexico_City",
  whatsappPhone: null,
  playlistUrl: null,
  playlistTitle: null,
  playlistCoverUrl: null,
  itinerary: null,
  giftRegistry: null,
  lodging: null,
  livestream: null,
  openingAnimation: true,
  reminders: null,
  rsvpDeadline: null,
  rsvpPartyLimit: 4,
  places: {},
  archivedAt: null,
  publishedAt: null,
  firstPublishedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-12-01T10:00:00.000Z"),
  updatedAt: new Date("2026-12-01T10:00:00.000Z"),
};
const OWNED = toOwnedInvitation(RECORD, { type: "object", required: [], properties: {} }, [], 5);
const SUMMARY = {
  id: RECORD.id,
  templateVersionId: RECORD.templateVersionId,
  packageId: RECORD.packageId,
  slug: RECORD.slug,
  status: RECORD.status,
  archivedAt: RECORD.archivedAt,
  publishedAt: RECORD.publishedAt,
  createdAt: RECORD.createdAt,
  updatedAt: RECORD.updatedAt,
};
const COLLABORATOR: InvitationCollaboratorRecord = {
  id: PARAMS.collaboratorId ?? randomUUID(),
  invitationId: INVITATION,
  email: CO_HOST_EMAIL,
  permissions: ["PUBLISH"],
  invitedAt: new Date("2026-12-14T12:00:00.000Z"),
  acceptedAt: null,
  revokedAt: null,
};
const MEDIA: MediaAssetView = {
  id: PARAMS.assetId ?? randomUUID(),
  kind: "gallery",
  url: "https://api.example.test/media/55555555-5555-4555-8555-555555555555",
  width: 1200,
  height: 800,
  alt: null,
  position: 0,
  createdAt: new Date("2026-12-14T12:00:00.000Z"),
};
const ALBUM: GuestAlbumRead = {
  photos: [],
  pendingCount: 0,
  publishedCount: 0,
  hiddenCount: 0,
};
const GUEST = {
  id: PARAMS.guestId ?? randomUUID(),
  invitationId: INVITATION,
  name: "Ana",
  seats: 2,
  phone: null,
  note: null,
  tableLabel: null,
  tokenIssuedAt: new Date("2026-12-14T12:00:00.000Z"),
  checkedInAt: null,
  createdAt: new Date("2026-12-14T12:00:00.000Z"),
  updatedAt: new Date("2026-12-14T12:00:00.000Z"),
  response: null,
};
const GUEST_LIST: GuestListRead = {
  slug: RECORD.slug,
  guests: [GUEST],
  totals: {
    guests: 1,
    seats: 2,
    attendingGuests: 0,
    attendingPeople: 0,
    attendingAdults: 0,
    attendingChildren: 0,
    declinedCount: 0,
    pendingCount: 1,
    checkedInCount: 0,
  },
} satisfies GuestListRead;
const GUEST_WITH_TOKEN: GuestWithToken = { guest: GUEST, token: "A".repeat(22) };
const RSVP_READ: RsvpRead = {
  slug: RECORD.slug,
  settings: { deadline: null, partyLimit: 4 },
  responses: [],
  totals: {
    attendingPeople: 0,
    attendingAdults: 0,
    attendingChildren: 0,
    declinedCount: 0,
    responses: 0,
  },
} as RsvpRead;
const GUESTBOOK_READ: GuestbookRead = { entries: [], visibleCount: 0, hiddenCount: 0 };
const GUESTBOOK_ENTRY = {
  id: PARAMS.entryId ?? randomUUID(),
  invitationId: INVITATION,
  authorName: "Tía Rosa",
  message: "¡Felicidades!",
  hidden: true,
  createdAt: new Date("2026-12-14T12:00:00.000Z"),
};
const PAYMENT = {
  paymentRequired: false,
  status: null,
  amountMinor: null,
  currency: null,
  paidAt: null,
};

/** The use cases the six controllers inject, each with the fixed answer its routes map. */
const USE_CASE_STUBS: Provider[] = [
  stub(CreateInvitationDraftUseCase, OWNED),
  stub(ListOwnInvitationsUseCase, [
    {
      ...SUMMARY,
      content: {},
      componentKey: null,
      configuration: null,
      role: "OWNER",
      permissions: [],
    },
  ]),
  stub(GetOwnInvitationUseCase, OWNED),
  stub(UpdateInvitationContentUseCase, OWNED),
  stub(UpdateInvitationFeaturesUseCase, OWNED),
  stub(SearchPlacesUseCase, []),
  stub(UpdateInvitationPlaceUseCase, OWNED),
  stub(ClearInvitationPlaceUseCase, OWNED),
  stub(CheckInvitationSlugAvailabilityUseCase, { slug: "valentina-xv", status: "available" }),
  stub(RenameInvitationSlugUseCase, OWNED),
  stub(ArchiveInvitationUseCase, SUMMARY),
  stub(PublishInvitationUseCase, OWNED),
  stub(UnpublishInvitationUseCase, SUMMARY),
  stub(UpdateRsvpSettingsUseCase, { deadline: null, partyLimit: 4 }),
  stub(GetRsvpResponsesUseCase, RSVP_READ),
  stub(GetGuestbookEntriesUseCase, GUESTBOOK_READ),
  stub(SetGuestbookEntryHiddenUseCase, { status: "ok", entry: GUESTBOOK_ENTRY }),
  stub(ListGuestsUseCase, GUEST_LIST),
  stub(CreateGuestUseCase, GUEST_WITH_TOKEN),
  stub(UpdateGuestUseCase, GUEST),
  stub(DeleteGuestUseCase, true),
  stub(RotateGuestTokenUseCase, GUEST_WITH_TOKEN),
  stub(CheckInGuestUseCase, {
    id: GUEST.id,
    name: GUEST.name,
    seats: GUEST.seats,
    partySize: 2,
    checkedInAt: new Date("2026-12-14T12:00:00.000Z"),
  }),
  stub(GetAttendanceExportUseCase, { filename: "invitacion.csv", body: "nombre\nAna\n" }),
  stub(UploadMediaUseCase, MEDIA),
  stub(ListOwnMediaUseCase, [MEDIA]),
  stub(ReadOwnMediaLimitsUseCase, { maxUploadBytes: 15_000_000, galleryPhotoLimit: 20 }),
  stub(UpdateMediaUseCase, MEDIA),
  stub(DeleteMediaUseCase, undefined),
  stub(GetGuestAlbumUseCase, ALBUM),
  stub(ReviewGuestPhotoUseCase, {
    status: "ok",
    photo: {
      id: PARAMS.photoId ?? randomUUID(),
      uploaderName: null,
      status: "PUBLISHED",
      createdAt: new Date("2026-12-14T12:00:00.000Z"),
      reviewedAt: new Date("2026-12-14T12:00:00.000Z"),
      url: "https://api.example.test/media/66666666-6666-4666-8666-666666666666",
    },
  }),
  stub(StartCheckoutUseCase, {
    paymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    redirectUrl: "https://pay.example.test/checkout",
    amountMinor: 49_900,
    currency: "MXN",
  }),
  stub(GetInvitationPaymentUseCase, PAYMENT),
  stub(ListInvitationCollaboratorsUseCase, {
    maxCollaborators: 5,
    collaborators: [COLLABORATOR],
  }),
  stub(InviteCollaboratorUseCase, COLLABORATOR),
  stub(UpdateCollaboratorPermissionsUseCase, COLLABORATOR),
  stub(RevokeCollaboratorUseCase, {
    ...COLLABORATOR,
    revokedAt: new Date("2026-12-15T12:00:00.000Z"),
  }),
  stub(AcceptCollaborationUseCase, { invitationId: INVITATION }),
];

/** The routes the module registers, read from Nest's own metadata rather than written by hand. */
interface RegisteredRoute {
  readonly method: string;
  /** The path with its `:params` placeholders, as the controller declares it. */
  readonly key: string;
  // biome-ignore lint/complexity/noBannedTypes: Nest's metadata carries the handler as a plain function value.
  readonly handler: Function;
  readonly controller: Type<unknown>;
}

const METHOD_NAMES: Record<number, string> = {
  0: "GET",
  1: "POST",
  2: "PUT",
  3: "DELETE",
  4: "PATCH",
  5: "OPTIONS",
  6: "HEAD",
  7: "SEARCH",
};

function registeredRoutes(controllers: readonly Type<unknown>[]): RegisteredRoute[] {
  const scanner = new MetadataScanner();
  const routes: RegisteredRoute[] = [];

  for (const controller of controllers) {
    const controllerPath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? "";
    const prototype = controller.prototype as Record<string, unknown>;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== "function") {
        continue;
      }
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      const handlerPath = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? "";
      if (method === undefined) {
        continue;
      }
      const path = `/${[controllerPath, handlerPath]
        .filter((part) => part !== "")
        .join("/")}`.replace(/\/+$/u, "");
      routes.push({
        method: METHOD_NAMES[method] ?? String(method),
        key: `${METHOD_NAMES[method] ?? String(method)} ${path}`,
        handler,
        controller,
      });
    }
  }

  return routes;
}

describe("the invitation authorization matrix (F12; L17.4, L17.6)", () => {
  const database: Record<string, unknown[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database as never),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  const collaborators = new MemoryCollaboratorRepository();
  const resolver = new StoredInvitationAccessResolver(collaborators);
  const reflector = new Reflector();

  let app: INestApplication;
  let baseUrl: string;
  let routes: RegisteredRoute[];
  /** One signed-in account per matrix row, keyed by row name. */
  const accounts = new Map<string, string>();
  const controllers: Type<unknown>[] = [];

  before(async () => {
    @Module({
      imports: [
        createConfigModule({
          NODE_ENV: "development",
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL,
        }),
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
      ],
      controllers: [
        InvitationsController,
        InvitationsMediaController,
        InvitationsGuestAlbumController,
        InvitationPaymentsController,
        InvitationsCollaboratorsController,
        CollaborationsController,
      ],
      providers: [
        ...USE_CASE_STUBS,
        // The guard the six controllers declare, and the one resolver it consults, over this suite's own table.
        InvitationAccessGuard,
        { provide: INVITATION_ACCESS_RESOLVER, useValue: resolver },
      ],
    })
    class InvitationMatrixModule {
      static readonly registered = [
        InvitationsController,
        InvitationsMediaController,
        InvitationsGuestAlbumController,
        InvitationPaymentsController,
        InvitationsCollaboratorsController,
        CollaborationsController,
      ];
    }
    controllers.push(...InvitationMatrixModule.registered);

    app = await createApp(InvitationMatrixModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    routes = registeredRoutes(controllers);

    for (const row of ROWS) {
      if (row.grants === "ANONYMOUS") {
        continue;
      }
      const userId = await signedInCustomer(`${row.name.replaceAll(" ", "-")}@example.test`);
      accounts.set(row.name, userId);
      // The owner needs no collaborator row: the resolver recognizes the invitation's owner first.
      if (row.name === "the owner") {
        collaborators.ownerId = userId;
      } else {
        collaborators.seed(userId, row.grants);
      }
    }
    assert.notEqual(collaborators.ownerId, OWNER, "the owner account was created and registered");
  });

  after(async () => {
    await app?.close();
  });

  async function signedInCustomer(email: string): Promise<string> {
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: true },
      { method: "email-otp" },
    );

    return created.id;
  }

  /** A signed session cookie for one account, as an email-code sign-in leaves it. */
  async function cookieFor(userId: string): Promise<string> {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(userId);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");

    return `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`;
  }

  function url(path: string): string {
    let resolved = path;
    for (const [name, value] of Object.entries(PARAMS)) {
      resolved = resolved.replaceAll(`:${name}`, value);
    }
    if (resolved.endsWith("/places/search")) {
      resolved = `${resolved}?q=quer%C3%A9taro`;
    }
    if (resolved.endsWith("/slug-availability")) {
      resolved = `${resolved}?slug=valentina-xv`;
    }

    return `${baseUrl}${resolved}`;
  }

  async function send(
    route: RegisteredRoute,
    fixture: RouteFixture,
    cookie: string | undefined,
  ): Promise<Response> {
    if (fixture.upload === true) {
      const form = new FormData();
      form.set("kind", "gallery");
      form.append(
        "file",
        new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" }),
        "foto.jpg",
      );

      return fetch(url(route.key.split(" ")[1] ?? ""), {
        method: route.method,
        headers: cookie === undefined ? {} : { cookie },
        body: form,
      });
    }

    return fetch(url(route.key.split(" ")[1] ?? ""), {
      method: route.method,
      headers: {
        "content-type": "application/json",
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(fixture.body === undefined ? {} : { body: JSON.stringify(fixture.body) }),
    });
  }

  it("registers every controller whose routes this matrix covers", () => {
    assert.deepEqual(
      routes.map((route) => route.key).sort(),
      Object.keys(FIXTURES).sort(),
      "every registered route has exactly one fixture, and no fixture names a route that does not exist",
    );
  });

  it("declares an access decision on every route that names an invitation, and none on the caller's own routes", () => {
    const undeclared: string[] = [];

    for (const route of routes) {
      const invitationScoped = route.key.split(" ")[1]?.includes(":id") ?? false;
      // The fixture key is what the request is built from, so a route without one would silently skip the matrix.
      assert.ok(FIXTURES[route.key] !== undefined, `${route.key} has no fixture`);
      const declared = readInvitationRouteAccess(reflector, route.handler, route.controller);

      if (invitationScoped && declared === undefined) {
        undeclared.push(route.key);
      }
    }
    // Deny by default would still refuse a collaborator here; this assertion is about review, not safety: an
    // undeclared invitation route means nobody decided who may reach it.
    assert.deepEqual(undeclared, [], "every invitation route declares what a collaborator needs");
  });

  it("admits exactly the declared permission, the owner, and nobody else", async () => {
    const cells: string[] = [];
    const wrong: string[] = [];

    for (const route of routes) {
      const fixture = FIXTURES[route.key];
      assert.ok(fixture);
      const declared = readInvitationRouteAccess(reflector, route.handler, route.controller);
      const invitationScoped = route.key.split(" ")[1]?.includes(":id") ?? false;
      const anyOf = invitationScoped ? (declared?.anyOf ?? []) : [];

      for (const row of ROWS) {
        const cookie =
          row.grants === "ANONYMOUS"
            ? undefined
            : await cookieFor(accounts.get(row.name) ?? "").catch(() => "");
        const response = await send(route, fixture, cookie);
        const expected = expectedStatus(route, row, fixture, anyOf, invitationScoped);
        cells.push(`${route.key} × ${row.name}`);

        if (response.status !== expected.status) {
          wrong.push(
            `${route.key} × ${row.name}: ${response.status} was ${await response.text()}, expected ${expected.status}`,
          );
          continue;
        }
        if (expected.body !== undefined) {
          const body: unknown = await response.json();
          if (JSON.stringify(body) !== JSON.stringify(expected.body)) {
            wrong.push(
              `${route.key} × ${row.name}: body ${JSON.stringify(body)} did not match ${JSON.stringify(expected.body)}`,
            );
          }
        } else {
          await response.arrayBuffer();
        }
        if (invitationScoped && row.name === "the owner") {
          // The owner's cell also proves the request reached the route: a fixture that made every handler fail would
          // otherwise look like an admitted caller.
          assert.ok(response.status < 500, `${route.key} answered a server error for its owner`);
        }
      }
    }

    assert.deepEqual(wrong, [], `${cells.length} cells checked`);
    assert.equal(cells.length, routes.length * ROWS.length);
  });

  /** What one cell must answer: the exact status, and the exact body for the refusals. */
  function expectedStatus(
    route: RegisteredRoute,
    row: MatrixRow,
    fixture: RouteFixture,
    anyOf: readonly Permission[],
    invitationScoped: boolean,
  ): { status: number; body?: unknown } {
    if (row.grants === "ANONYMOUS") {
      return { status: 401, body: { message: "Unauthorized", statusCode: 401 } };
    }
    if (!invitationScoped) {
      // The caller's own routes: the list, the creation, and the acceptance, which the token itself scopes.
      return { status: fixture.success };
    }
    if (row.name === "the owner") {
      return { status: fixture.success };
    }
    if (row.grants === "PENDING" || row.grants === "REVOKED" || row.grants === "STRANGER") {
      return { status: 404, body: notFoundBody(route) };
    }
    const granted: readonly Permission[] =
      row.grants === "ALL"
        ? ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"]
        : (row.grants as Permission[]);
    const admitted = anyOf.some((permission) => granted.includes(permission));

    return admitted
      ? { status: fixture.success }
      : { status: 403, body: { code: "INVITATION_FORBIDDEN" } };
  }

  /** The module's own 404 body: the media routes answer `MEDIA_NOT_FOUND`, every other module `INVITATION_NOT_FOUND`. */
  function notFoundBody(route: RegisteredRoute): unknown {
    return route.controller === InvitationsMediaController
      ? { code: "MEDIA_NOT_FOUND", message: "Media not found." }
      : { code: "INVITATION_NOT_FOUND" };
  }
});
