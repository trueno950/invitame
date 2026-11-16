import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";

import { type INestApplication, Logger, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import {
  GUEST_REPOSITORY,
  type GuestCheckIn,
  type GuestFields,
  type GuestListReadModel,
  type GuestRecord,
  type GuestRepository,
  type GuestResponseWrite,
  type GuestWithResponse,
  type NewGuest,
} from "../application/guest.repository";
import { guestTokenHash } from "../application/guest-token";
import { InvitationSlugTakenError } from "../application/invitation.application.errors";
import {
  INVITATION_REPOSITORY,
  type InvitationRecord,
  type InvitationRepository,
  type NewInvitation,
} from "../application/invitation.repository";
import {
  type CatalogPackageEntitlements,
  type CatalogTemplateVersionSnapshot,
  type CatalogVersionRenderData,
  type CatalogVersionSchema,
  INVITATION_CATALOG,
  type InvitationCatalog,
} from "../application/invitation-catalog";
import { GuestSeatsBelowConfirmedPartyError } from "../application/invitation-guest.errors";
import {
  INVITATION_PAYMENT_GATE,
  type InvitationPaymentDecision,
  type InvitationPaymentGate,
} from "../application/invitation-payment-gate";
import {
  RSVP_REPOSITORY,
  type RsvpReadModel,
  type RsvpRepository,
  type RsvpResponseRecord,
  type RsvpResponseWrite,
} from "../application/rsvp.repository";
import { RSVP_RATE_LIMITER, type RsvpRateLimiter } from "../application/rsvp-rate-limiter";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { RsvpSettings } from "../domain/invitation-rsvp";
import { INVITATION_USE_CASES } from "../invitations.module";
import { InvitationsController } from "./invitations.controller";
import { PublicInvitationsController } from "./public-invitations.controller";

// `/invitations` (M4 T4 and M5 T4; S1, S2, S3, S7, S9, A3, A4, A7) and the `@Public()` public read of a
// published slug, through the shared createApp boundary, the project-owned guard, and Better Auth on the in-memory
// adapter. The invitation port and the catalog contract are in-memory fakes, so the suite needs no network and no
// database; their Prisma adapters are proved in the `*.db-spec.ts` suites, and the use cases themselves in
// `invitation.use-cases.spec.ts`. What this suite owns is the HTTP contract: the session is the only source of the
// owner (S9), no response carries `ownerId`, an id that is not a UUID is refused before it reaches a port, every
// application or domain error maps to its documented status and body, and the public page carries only the
// allow-listed projection with one identical 404 for every slug a guest must not render (A3, A7).

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const PATH = "/invitations";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PUBLISHED_VERSION_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_PACKAGE_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_VERSION_ID = "44444444-4444-4444-8444-444444444444";
/** PUBLISHED, but its `componentKey` is outside the API's renderer allow-list (A3). */
const UNRENDERABLE_VERSION_ID = "55555555-5555-4555-8555-555555555555";
/** An ACTIVE package that includes the implemented catalog features (F1, F6, F7; S4, S7). */
const FEATURE_PACKAGE_ID = "66666666-6666-4666-8666-666666666666";
/** An ACTIVE package with the batch-2 features: music and the gift registry (S7). */
const MUSIC_PACKAGE_ID = "77777777-7777-4777-8777-777777777777";
/** An ACTIVE package with RSVP and no guest list: the open form (M6 S4). */
const RSVP_PACKAGE_ID = "88888888-8888-4888-8888-888888888888";
/** An ACTIVE package with the guest list, which replaces the open form (M6 S4; G2 implements it). */
const GUEST_LIST_PACKAGE_ID = "99999999-9999-4999-8999-999999999999";
/** The seeded Deluxe keys (M6 S3): the guest list and its access pass (G2). */
const QR_PASS_PACKAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHONE = "+525512345678";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
const RENDERER = "birthday-poster-01";
const UNREGISTERED_RENDERER = "unregistered-renderer-99";
const SCHEMA = {
  type: "object",
  required: ["title"],
  properties: { title: { type: "string", maxLength: 120 } },
};

type Row = Record<string, unknown>;

/** The invitation port in memory: owner scoping, a unique slug, and the lifecycle writes the adapter runs. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecord[] = [];
  /** How many upcoming creates collide on the slug; the create use case retries and then answers 503. */
  slugCollisions = 0;
  private sequence = 0;

  async create(input: NewInvitation): Promise<InvitationRecord> {
    if (this.slugCollisions > 0) {
      this.slugCollisions -= 1;
      throw new InvitationSlugTakenError(input.slug);
    }
    if (this.rows.some((row) => row.slug === input.slug)) {
      throw new InvitationSlugTakenError(input.slug);
    }
    this.sequence += 1;
    const at = new Date(Date.UTC(2026, 10, 11, 12, 0, this.sequence));
    const row: InvitationRecord = {
      id: randomUUID(),
      ...input,
      content: structuredClone(input.content),
      status: "DRAFT",
      // The database defaults every new row reads (S4, M6 G1).
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      archivedAt: null,
      publishedAt: null,
      expiresAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return structuredClone(row);
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    return row ? structuredClone(row) : null;
  }

  async listOwned(ownerId: string): Promise<InvitationRecord[]> {
    return this.rows
      .filter((row) => row.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((row) => structuredClone(row));
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: JsonObject,
  ): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    row.content = structuredClone(content);
    return structuredClone(row);
  }

  async updateFeatures(
    ownerId: string,
    id: string,
    features: { timeZone: string; whatsappPhone: string | null; playlistUrl: string | null },
  ): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    row.timeZone = features.timeZone;
    row.whatsappPhone = features.whatsappPhone;
    row.playlistUrl = features.playlistUrl;
    return structuredClone(row);
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // Archiving is allowed from DRAFT or from PUBLISHED, and clears the publication marker (A2).
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "ARCHIVED";
    row.archivedAt = new Date();
    row.publishedAt = null;
    return structuredClone(row);
  }

  async publish(ownerId: string, id: string, at: Date): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "PUBLISHED") {
      throw new InvitationAlreadyPublishedError();
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "PUBLISHED";
    row.publishedAt = at;
    row.updatedAt = at;
    return structuredClone(row);
  }

  async unpublish(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "DRAFT") {
      throw new InvitationNotPublishedError();
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "DRAFT";
    row.publishedAt = null;
    return structuredClone(row);
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecord | null> {
    const now = Date.now();
    const row = this.rows.find(
      (stored) =>
        stored.slug === slug &&
        stored.status === "PUBLISHED" &&
        (stored.expiresAt === null || stored.expiresAt.getTime() > now),
    );
    return row ? structuredClone(row) : null;
  }
}

/**
 * The catalog contract in memory: one PUBLISHED version, one DRAFT version, and one ACTIVE and one DRAFT
 * package. An unpublished version answers `findPublishedVersion` with null and `findVersionSchema` with its
 * schema, exactly as the catalog contract states (S3). One extra version is PUBLISHED but names a renderer the
 * API's allow-list does not know, so the public read can be shown refusing it (A3).
 */
class MemoryInvitationCatalog implements InvitationCatalog {
  readonly versions = new Map<
    string,
    { published: boolean; schema: unknown; componentKey?: string }
  >([
    [PUBLISHED_VERSION_ID, { published: true, schema: SCHEMA }],
    [DRAFT_VERSION_ID, { published: false, schema: SCHEMA }],
    [
      UNRENDERABLE_VERSION_ID,
      { published: true, schema: SCHEMA, componentKey: UNREGISTERED_RENDERER },
    ],
  ]);
  readonly packages = new Map<string, CatalogPackageEntitlements>([
    [ACTIVE_PACKAGE_ID, { status: "ACTIVE", includedFeatureKeys: [] }],
    [DRAFT_PACKAGE_ID, { status: "DRAFT", includedFeatureKeys: [] }],
    // The seeded Basic package's keys (prisma/catalog-seed.ts), for the gated feature read (S4).
    [
      FEATURE_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["COUNTDOWN", "MAP", "WHATSAPP"] },
    ],
    // The seeded Deluxe package's batch-2 keys (S7): music and the gift registry.
    [
      MUSIC_PACKAGE_ID,
      {
        status: "ACTIVE",
        includedFeatureKeys: ["COUNTDOWN", "MUSIC", "MAP", "WHATSAPP", "GIFT_REGISTRY"],
      },
    ],
    // The seeded Premium keys (M6 S3): RSVP without a guest list.
    [RSVP_PACKAGE_ID, { status: "ACTIVE", includedFeatureKeys: ["COUNTDOWN", "RSVP"] }],
    // The seeded Deluxe keys (M6 S3): the guest list replaces the open form.
    [
      GUEST_LIST_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["COUNTDOWN", "RSVP", "GUEST_LIST"] },
    ],
    // The same keys plus the access pass (M6 G2; S3, S4).
    [
      QR_PASS_PACKAGE_ID,
      {
        status: "ACTIVE",
        includedFeatureKeys: ["COUNTDOWN", "RSVP", "GUEST_LIST", "QR_PASS"],
      },
    ],
  ]);

  /** Every version renders with the allow-listed component unless it says otherwise. */
  private componentKeyOf(versionId: string): string {
    return this.versions.get(versionId)?.componentKey ?? RENDERER;
  }

  async findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null> {
    const stored = this.versions.get(versionId);
    if (!stored?.published) {
      return null;
    }

    return {
      id: versionId,
      templateId: randomUUID(),
      componentKey: this.componentKeyOf(versionId),
      schema: stored.schema,
      requiredFeatureKeys: [],
    };
  }

  async findVersionSchema(versionId: string): Promise<CatalogVersionSchema | null> {
    const stored = this.versions.get(versionId);
    return stored ? { id: versionId, schema: stored.schema } : null;
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    return this.packages.get(packageId) ?? null;
  }

  async findVersionRenderData(versionId: string): Promise<CatalogVersionRenderData | null> {
    const stored = this.versions.get(versionId);
    if (!stored) {
      return null;
    }
    const componentKey = this.componentKeyOf(versionId);

    return {
      componentKey,
      configuration: { componentKey },
      schema: stored.schema,
    };
  }

  isRendererRegistered(componentKey: string): boolean {
    return componentKey === RENDERER;
  }
}

/**
 * The publication payment gate in memory (S6): it answers "no payment required" until a test asks it to
 * refuse, so the 402 outcome can be observed even though Milestone 5 binds the always-free adapter.
 */
class MemoryPaymentGate implements InvitationPaymentGate {
  refusalReason: string | null = null;
  asked = 0;

  async publicationPaymentRequired(): Promise<InvitationPaymentDecision> {
    this.asked += 1;
    return this.refusalReason === null
      ? { required: false }
      : { required: true, reason: this.refusalReason };
  }
}

/**
 * The RSVP port in memory (M6 G1; S1, S4). It repeats the adapter's own guards — the owner scope, an editable
 * status, and a still-published invitation — so a route that skipped them would be caught here.
 */
class MemoryRsvpRepository implements RsvpRepository {
  readonly responses: RsvpResponseRecord[] = [];
  /** The settings of every invitation, written through `PUT /invitations/:id/rsvp-settings`. */
  readonly settings = new Map<string, RsvpSettings>();
  private sequence = 0;

  constructor(private readonly invitations: MemoryInvitationRepository) {}

  theSettings(invitationId: string): RsvpSettings {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    return {
      deadline: invitation?.rsvpDeadline ?? null,
      partyLimit: invitation?.rsvpPartyLimit ?? 4,
    };
  }

  async saveSettings(
    ownerId: string,
    id: string,
    settings: RsvpSettings,
  ): Promise<RsvpSettings | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === id && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    if (invitation.status === "ARCHIVED") {
      throw new InvitationNotEditableError(invitation.status);
    }
    invitation.rsvpDeadline = settings.deadline;
    invitation.rsvpPartyLimit = settings.partyLimit;
    this.settings.set(id, settings);
    return settings;
  }

  async findResponses(ownerId: string, id: string): Promise<RsvpReadModel | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === id && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    return {
      slug: invitation.slug,
      settings: this.theSettings(id),
      responses: this.responses
        .filter((response) => response.invitationId === id)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    };
  }

  async upsertResponse(
    invitationId: string,
    response: RsvpResponseWrite,
    at: Date,
  ): Promise<boolean> {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    if (
      invitation?.status !== "PUBLISHED" ||
      (invitation.rsvpDeadline !== null && at.getTime() > invitation.rsvpDeadline.getTime())
    ) {
      return false;
    }
    const existing = this.responses.find(
      (stored) => stored.invitationId === invitationId && stored.dedupeKey === response.dedupeKey,
    );
    if (existing) {
      Object.assign(existing, response, { updatedAt: at });
      return true;
    }
    this.sequence += 1;
    this.responses.push({
      id: randomUUID(),
      invitationId,
      ...response,
      createdAt: new Date(at.getTime() + this.sequence),
      updatedAt: at,
    });
    return true;
  }

  /** A response inserted directly, for the creator read and the export under test. */
  seedResponse(
    invitationId: string,
    overrides: Partial<RsvpResponseWrite> & { createdAt?: Date; updatedAt?: Date } = {},
  ): RsvpResponseRecord {
    const at = overrides.createdAt ?? new Date(Date.UTC(2026, 10, 19, 10, 0, 0));
    const stored: RsvpResponseRecord = {
      id: randomUUID(),
      invitationId,
      name: "Ana Pérez",
      dedupeKey: "ana perez|+525512345678",
      attending: true,
      partySize: 2,
      phone: "+525512345678",
      message: null,
      createdAt: at,
      updatedAt: overrides.updatedAt ?? at,
      ...overrides,
    };
    this.responses.push(stored);
    return stored;
  }
}

/**
 * The guest port in memory (M6 G2; S1, S4). It repeats the adapter's own guards — the owner scope, the editable
 * statuses, the attending answer a check-in needs, and the seats a confirmed party needs — so a route that skipped
 * one would be caught here. The plain token never enters this class: it holds the digests, as `Guest.tokenHash` does.
 */
class MemoryGuestRepository implements GuestRepository {
  readonly guests: Array<GuestRecord & { tokenHash: string }> = [];
  readonly responses: Array<
    GuestResponseWrite & { guestId: string; createdAt: Date; updatedAt: Date }
  > = [];
  private sequence = 0;

  constructor(private readonly invitations: MemoryInvitationRepository) {}

  private editable(ownerId: string, invitationId: string): InvitationRecord | null {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    if (invitation.status === "ARCHIVED") {
      throw new InvitationNotEditableError(invitation.status);
    }
    return invitation;
  }

  private of(invitationId: string, guestId: string) {
    return this.guests.find((row) => row.id === guestId && row.invitationId === invitationId);
  }

  private withResponse(guest: GuestRecord & { tokenHash: string }): GuestWithResponse {
    const answer = this.responses.find((row) => row.guestId === guest.id) ?? null;
    return {
      id: guest.id,
      invitationId: guest.invitationId,
      name: guest.name,
      seats: guest.seats,
      phone: guest.phone,
      note: guest.note,
      tokenIssuedAt: guest.tokenIssuedAt,
      checkedInAt: guest.checkedInAt,
      createdAt: guest.createdAt,
      updatedAt: guest.updatedAt,
      response:
        answer === null
          ? null
          : {
              attending: answer.attending,
              partySize: answer.partySize,
              message: answer.message,
              createdAt: answer.createdAt,
              updatedAt: answer.updatedAt,
            },
    };
  }

  async create(
    ownerId: string,
    invitationId: string,
    guest: NewGuest,
    at: Date,
  ): Promise<GuestRecord | null> {
    if (this.editable(ownerId, invitationId) === null) {
      return null;
    }
    this.sequence += 1;
    const created = {
      id: randomUUID(),
      invitationId,
      name: guest.name,
      seats: guest.seats,
      phone: guest.phone,
      note: guest.note,
      tokenHash: guest.tokenHash,
      tokenIssuedAt: at,
      checkedInAt: null,
      createdAt: new Date(at.getTime() + this.sequence),
      updatedAt: at,
    };
    this.guests.push(created);
    return this.withResponse(created);
  }

  async findGuests(ownerId: string, invitationId: string): Promise<GuestListReadModel | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    return {
      slug: invitation.slug,
      guests: this.guests
        .filter((row) => row.invitationId === invitationId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((row) => this.withResponse(row)),
    };
  }

  async findGuest(
    ownerId: string,
    invitationId: string,
    guestId: string,
  ): Promise<GuestWithResponse | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    return guest === undefined ? null : this.withResponse(guest);
  }

  async update(
    ownerId: string,
    invitationId: string,
    guestId: string,
    fields: GuestFields,
    at: Date,
  ): Promise<GuestRecord | null> {
    if (this.editable(ownerId, invitationId) === null) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    if (guest === undefined) {
      return null;
    }
    const answer = this.responses.find((row) => row.guestId === guestId);
    if (answer?.attending === true && answer.partySize > fields.seats) {
      throw new GuestSeatsBelowConfirmedPartyError(answer.partySize);
    }
    Object.assign(guest, fields, { updatedAt: at });
    return this.withResponse(guest);
  }

  async remove(ownerId: string, invitationId: string, guestId: string): Promise<boolean> {
    if (this.editable(ownerId, invitationId) === null) {
      return false;
    }
    const index = this.guests.findIndex(
      (row) => row.id === guestId && row.invitationId === invitationId,
    );
    if (index === -1) {
      return false;
    }
    this.guests.splice(index, 1);
    for (let position = this.responses.length - 1; position >= 0; position -= 1) {
      if (this.responses[position]?.guestId === guestId) {
        this.responses.splice(position, 1);
      }
    }
    return true;
  }

  async rotateToken(
    ownerId: string,
    invitationId: string,
    guestId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestRecord | null> {
    if (this.editable(ownerId, invitationId) === null) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    if (guest === undefined) {
      return null;
    }
    guest.tokenHash = tokenHash;
    guest.tokenIssuedAt = at;
    guest.updatedAt = at;
    return this.withResponse(guest);
  }

  async findByToken(invitationId: string, tokenHash: string): Promise<GuestWithResponse | null> {
    const guest = this.guests.find(
      (row) => row.invitationId === invitationId && row.tokenHash === tokenHash,
    );
    return guest === undefined ? null : this.withResponse(guest);
  }

  async upsertResponse(
    invitationId: string,
    guestId: string,
    response: GuestResponseWrite,
    at: Date,
  ): Promise<boolean> {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    const guest = this.of(invitationId, guestId);
    if (
      invitation?.status !== "PUBLISHED" ||
      guest === undefined ||
      (invitation.rsvpDeadline !== null && at.getTime() > invitation.rsvpDeadline.getTime())
    ) {
      return false;
    }
    const existing = this.responses.find((row) => row.guestId === guestId);
    if (existing !== undefined) {
      Object.assign(existing, response, { updatedAt: at });
      return true;
    }
    this.responses.push({ guestId, ...response, createdAt: at, updatedAt: at });
    return true;
  }

  async checkIn(
    ownerId: string,
    invitationId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestCheckIn | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    const guest = this.guests.find(
      (row) => row.invitationId === invitationId && row.tokenHash === tokenHash,
    );
    if (invitation === undefined || guest === undefined || invitation.status === "ARCHIVED") {
      return null;
    }
    const answer = this.responses.find((row) => row.guestId === guest.id);
    if (answer?.attending !== true) {
      return null;
    }
    guest.checkedInAt ??= at;
    return {
      id: guest.id,
      name: guest.name,
      seats: guest.seats,
      partySize: answer.partySize,
      checkedInAt: guest.checkedInAt,
    };
  }

  /** A guest inserted directly, for the reads and the check-in under test. */
  seedGuest(
    invitationId: string,
    overrides: Partial<GuestFields> & { token: string; checkedInAt?: Date | null } = {
      token: "A".repeat(22),
    },
  ): GuestRecord & { tokenHash: string } {
    this.sequence += 1;
    const at = new Date(Date.UTC(2026, 10, 19, 10, 0, 0));
    const created = {
      id: randomUUID(),
      invitationId,
      name: overrides.name ?? "Ana Pérez",
      seats: overrides.seats ?? 3,
      phone: overrides.phone ?? PHONE,
      note: overrides.note ?? "Mesa 4",
      tokenHash: guestTokenHash(overrides.token),
      tokenIssuedAt: at,
      checkedInAt: overrides.checkedInAt ?? null,
      createdAt: new Date(at.getTime() + this.sequence),
      updatedAt: at,
    };
    this.guests.push(created);
    return created;
  }

  /** A stored answer for one guest, for the check-in and the export under test. */
  seedResponse(guestId: string, overrides: Partial<GuestResponseWrite> = {}): void {
    const at = new Date(Date.UTC(2026, 10, 20, 10, 0, 0));
    this.responses.push({
      guestId,
      attending: true,
      partySize: 2,
      message: "Vamos",
      createdAt: at,
      updatedAt: at,
      ...overrides,
    });
  }
}

/**
 * The RSVP rate limiter in memory (M6 G1; S4): records what it counted and answers whatever a test chose, so the
 * 429 outcome is observable without a database.
 */
class MemoryRateLimiter implements RsvpRateLimiter {
  allow = true;
  readonly consumed: Array<{ invitationId: string; clientAddress: string }> = [];

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    this.consumed.push({ invitationId, clientAddress });
    return this.allow;
  }
}

describe("invitations routes: /invitations", () => {
  const database: Record<string, Row[]> = {
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
    database: memoryAdapter(database),
    // No probe here requests a sign-in code.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  const repository = new MemoryInvitationRepository();
  const catalog = new MemoryInvitationCatalog();
  const paymentGate = new MemoryPaymentGate();
  const rsvpRepository = new MemoryRsvpRepository(repository);
  const guestRepository = new MemoryGuestRepository(repository);
  const rateLimiter = new MemoryRateLimiter();
  let app: INestApplication;
  let baseUrl: string;
  let userCounter = 0;

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
      controllers: [InvitationsController, PublicInvitationsController],
      providers: [
        ...INVITATION_USE_CASES,
        { provide: INVITATION_REPOSITORY, useValue: repository },
        { provide: INVITATION_CATALOG, useValue: catalog },
        // Publication is free in Milestone 5; the publish use case asks this gate (S6).
        { provide: INVITATION_PAYMENT_GATE, useValue: paymentGate },
        { provide: RSVP_REPOSITORY, useValue: rsvpRepository },
        { provide: GUEST_REPOSITORY, useValue: guestRepository },
        { provide: RSVP_RATE_LIMITER, useValue: rateLimiter },
      ],
    })
    class InvitationsTestModule {}

    app = await createApp(InvitationsTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A stored customer and a signed session cookie for them, as an email-code sign-in leaves them. */
  async function signedInCustomer(): Promise<{ userId: string; cookie: string }> {
    userCounter += 1;
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email: `m4-t4-invitations-${userCounter}@example.test`, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    const session = await context.internalAdapter.createSession(created.id);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      userId: created.id,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    };
  }

  function send(
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  }

  const draftBody = () => ({
    templateVersionId: PUBLISHED_VERSION_ID,
    packageId: ACTIVE_PACKAGE_ID,
  });

  async function createDraft(cookie: string) {
    const response = await send("POST", PATH, cookie, draftBody());
    assert.equal(response.status, 201);
    return (await response.json()) as Row & { id: string; slug: string };
  }

  const SUMMARY_KEYS = [
    "archivedAt",
    "createdAt",
    "id",
    "packageId",
    "publishedAt",
    "slug",
    "status",
    "templateVersionId",
    "updatedAt",
  ];
  const OWNED_KEYS = [
    ...SUMMARY_KEYS,
    "content",
    "missingRequiredFields",
    "timeZone",
    "featureSettings",
    "availableFeatures",
  ].sort();

  describe("access control", () => {
    const requests: Array<[string, string, string, unknown?]> = [
      ["create", "POST", PATH, { templateVersionId: 42, role: "ADMIN" }],
      ["list", "GET", PATH],
      ["read", "GET", `${PATH}/${UNKNOWN_ID}`],
      ["replace content", "PUT", `${PATH}/${UNKNOWN_ID}/content`, { content: "not-an-object" }],
      [
        "replace features",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/features`,
        { timeZone: "Europe/Madrid", whatsappPhone: "12345" },
      ],
      ["archive", "POST", `${PATH}/${UNKNOWN_ID}/archive`],
      ["publish", "POST", `${PATH}/${UNKNOWN_ID}/publish`],
      ["unpublish", "POST", `${PATH}/${UNKNOWN_ID}/unpublish`],
      [
        "rsvp settings",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/rsvp-settings`,
        { deadline: null, partyLimit: 4 },
      ],
      ["rsvp read", "GET", `${PATH}/${UNKNOWN_ID}/rsvp`],
      ["rsvp export", "GET", `${PATH}/${UNKNOWN_ID}/rsvp.csv`],
      ["guest list", "GET", `${PATH}/${UNKNOWN_ID}/guests`],
      [
        "create guest",
        "POST",
        `${PATH}/${UNKNOWN_ID}/guests`,
        { name: "Ana", seats: 2, phone: null, note: null },
      ],
      [
        "edit guest",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/guests/${UNKNOWN_ID}`,
        { name: "Ana", seats: 2, phone: null, note: null },
      ],
      ["remove guest", "DELETE", `${PATH}/${UNKNOWN_ID}/guests/${UNKNOWN_ID}`],
      ["rotate guest token", "POST", `${PATH}/${UNKNOWN_ID}/guests/${UNKNOWN_ID}/token`],
      [
        "guest check-in",
        "POST",
        `${PATH}/${UNKNOWN_ID}/guests/check-in`,
        { token: "A".repeat(22) },
      ],
    ];

    it("answers 401 without a valid session, before validating the body, and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const headers = [undefined, `${SESSION_COOKIE}=not-a-session`, `${cookie.slice(0, -4)}AAAA`];

      for (const header of headers) {
        for (const [label, method, target, body] of requests) {
          assert.equal((await send(method, target, header, body)).status, 401, label);
        }
      }
      assert.equal(repository.rows.length, 0);
    });

    it("lets a signed-in customer reach every route (none answers 401 or 403)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const [label, method, target, body] of requests) {
        const patched = target.replace(UNKNOWN_ID, draft.id);
        const response = await send(method, patched, cookie, body ?? undefined);
        assert.ok(
          response.status !== 401 && response.status !== 403,
          `${label}: ${response.status}`,
        );
      }
    });
  });

  describe("POST /invitations", () => {
    it("creates a DRAFT owned by the session user and answers 201 with the owned invitation", async () => {
      const { userId, cookie } = await signedInCustomer();

      const response = await send("POST", PATH, cookie, draftBody());

      assert.equal(response.status, 201);
      const body = (await response.json()) as Row & { id: string };
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.archivedAt, null);
      assert.equal(body.templateVersionId, PUBLISHED_VERSION_ID);
      assert.equal(body.packageId, ACTIVE_PACKAGE_ID);
      assert.match(String(body.slug), /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.deepEqual(body.content, {});
      assert.deepEqual(body.missingRequiredFields, ["title"]);
      assert.equal(body.timeZone, "America/Mexico_City");
      assert.deepEqual(body.featureSettings, { whatsappPhone: null, playlistUrl: null });
      // The ACTIVE fixture package includes no catalog feature, so only the calendar is offered (S4).
      assert.deepEqual(body.availableFeatures, ["CALENDAR"]);
      for (const field of ["createdAt", "updatedAt"]) {
        assert.equal(new Date(String(body[field])).toISOString(), body[field], field);
      }

      const stored = repository.rows.find((row) => row.id === body.id);
      assert.ok(stored);
      assert.equal(stored.ownerId, userId);
    });

    it("takes the owner from the session and never from the body", async () => {
      const { userId, cookie } = await signedInCustomer();
      const other = await signedInCustomer();

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        ownerId: other.userId,
      });

      // An unknown field is refused by the global pipe, so no request can even offer an owner.
      assert.equal(response.status, 400);
      assert.equal(
        repository.rows.some((row) => row.ownerId === other.userId),
        false,
      );

      const accepted = await createDraft(cookie);
      assert.equal(repository.rows.find((row) => row.id === accepted.id)?.ownerId, userId);
    });

    it("answers 400 for a body the DTO refuses and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;
      const bodies: unknown[] = [
        {},
        { templateVersionId: PUBLISHED_VERSION_ID },
        { packageId: ACTIVE_PACKAGE_ID },
        { templateVersionId: "not-a-uuid", packageId: ACTIVE_PACKAGE_ID },
        { templateVersionId: PUBLISHED_VERSION_ID, packageId: "not-a-uuid" },
        { ...draftBody(), slug: "chosen-by-the-client" },
        { ...draftBody(), status: "ARCHIVED" },
        "not-json",
      ];

      for (const body of bodies) {
        const response = await send("POST", PATH, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(repository.rows.length, before);
    });

    it("answers 404 INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED for a version that is missing or not published", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      for (const templateVersionId of [UNKNOWN_ID, DRAFT_VERSION_ID]) {
        const response = await send("POST", PATH, cookie, {
          ...draftBody(),
          templateVersionId,
        });

        assert.equal(response.status, 404, templateVersionId);
        assert.deepEqual(await response.json(), {
          code: "INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED",
        });
      }
      assert.equal(repository.rows.length, before);
    });

    it("answers 404 INVITATION_PACKAGE_NOT_FOUND for a package that does not exist", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        packageId: UNKNOWN_ID,
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_PACKAGE_NOT_FOUND" });
      assert.equal(repository.rows.length, before);
    });

    it("answers 400 INVITATION_PACKAGE_DOES_NOT_FIT for a package that does not fit and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        packageId: DRAFT_PACKAGE_ID,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "INVITATION_PACKAGE_DOES_NOT_FIT" });
      assert.equal(repository.rows.length, before);
    });

    it("answers 503 INVITATION_SLUG_UNAVAILABLE when no slug can be stored and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;
      repository.slugCollisions = Number.MAX_SAFE_INTEGER;

      try {
        const response = await send("POST", PATH, cookie, draftBody());

        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_UNAVAILABLE" });
        assert.equal(repository.rows.length, before);
      } finally {
        repository.slugCollisions = 0;
      }
    });
  });

  describe("GET /invitations", () => {
    it("lists only the session user's invitations, newest first, with no ownerId", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const first = await createDraft(owner.cookie);
      const second = await createDraft(owner.cookie);
      await createDraft(other.cookie);

      const response = await send("GET", PATH, owner.cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      assert.deepEqual(
        body.map((item) => item.id),
        [second.id, first.id],
      );
      for (const item of body) {
        assert.deepEqual(Object.keys(item).sort(), SUMMARY_KEYS);
        assert.equal(item.ownerId, undefined);
      }
    });

    it("answers an empty list to an owner without invitations", async () => {
      const { cookie } = await signedInCustomer();

      const response = await send("GET", PATH, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
    });
  });

  describe("GET /invitations/:id", () => {
    it("answers the owner's invitation with its content and missing required fields", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("GET", `${PATH}/${draft.id}`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.ownerId, undefined);
      assert.deepEqual(body.content, {});
      assert.deepEqual(body.missingRequiredFields, ["title"]);
      assert.equal(body.timeZone, "America/Mexico_City");
      assert.deepEqual(body.featureSettings, { whatsappPhone: null, playlistUrl: null });
      assert.deepEqual(body.availableFeatures, ["CALENDAR"]);
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("GET", `${PATH}/${id}`, other.cookie);
        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
    });

    it("answers 400 for an id that is not a UUID", async () => {
      const { cookie } = await signedInCustomer();

      const probes: Array<[string, string, unknown?]> = [
        ["GET", `${PATH}/not-a-uuid`],
        ["GET", `${PATH}/1`],
        ["PUT", `${PATH}/1/content`, { content: {} }],
        ["POST", `${PATH}/1/archive`],
        ["POST", `${PATH}/1/publish`],
        ["POST", `${PATH}/1/unpublish`],
        ["PUT", `${PATH}/1/rsvp-settings`, { deadline: null, partyLimit: 4 }],
        ["GET", `${PATH}/1/rsvp`],
        ["GET", `${PATH}/1/rsvp.csv`],
        ["GET", `${PATH}/1/guests`],
        ["POST", `${PATH}/1/guests`, { name: "Ana", seats: 1, phone: null, note: null }],
        ["PUT", `${PATH}/1/guests/1`, { name: "Ana", seats: 1, phone: null, note: null }],
        ["DELETE", `${PATH}/1/guests/1`],
        ["POST", `${PATH}/1/guests/1/token`],
        ["POST", `${PATH}/1/guests/check-in`, { token: "A".repeat(22) }],
      ];

      for (const [method, path, body] of probes) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 400, `${method} ${path}`);
      }
    });
  });

  describe("PUT /invitations/:id/content", () => {
    it("replaces the content, validates it against the pinned version, and answers the owned invitation", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Cumpleaños de Ana" },
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual(body.content, { title: "Cumpleaños de Ana" });
      assert.deepEqual(body.missingRequiredFields, []);
      assert.equal(body.ownerId, undefined);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, {
        title: "Cumpleaños de Ana",
      });
    });

    it("answers 400 INVALID_INVITATION_CONTENT with its issues and keeps the stored content", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id)?.content);

      for (const content of [{ title: 42 }, { subtitle: "x" }, "not-an-object", []]) {
        const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content });

        assert.equal(response.status, 400, JSON.stringify(content));
        const body = (await response.json()) as { code: string; issues: string[] };
        assert.equal(body.code, "INVALID_INVITATION_CONTENT");
        assert.ok(Array.isArray(body.issues) && body.issues.length > 0);
      }
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, before);
    });

    it("answers 400 for a body without content or with an unknown field, and changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const body of [{}, { content: {}, templateVersionId: UNKNOWN_ID }, { content: "x" }]) {
        const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, {});
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps it unchanged", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Ana" },
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.deepEqual(stored?.content, {});
    });

    it("answers 404 for another customer's invitation and changes nothing", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, other.cookie, {
        content: { title: "Ana" },
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.deepEqual(stored?.content, {});
      assert.equal(stored?.status, "DRAFT");
    });
  });

  describe("PUT /invitations/:id/features", () => {
    it("stores the zone, the normalized phone, and the playlist link and answers the owned invitation (F1, F6; S4, S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: "(55) 1234-5678",
        playlistUrl: PLAYLIST,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual(body.featureSettings, { whatsappPhone: PHONE, playlistUrl: PLAYLIST });
      // The ACTIVE fixture package includes no catalog feature, so only the calendar is offered (S4).
      assert.deepEqual(body.availableFeatures, ["CALENDAR"]);
      assert.equal(body.ownerId, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.timeZone, "America/Tijuana");
      assert.equal(stored?.whatsappPhone, PHONE);
      assert.equal(stored?.playlistUrl, PLAYLIST);
    });

    it("clears the stored phone with null and with an empty value (S4)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Cancun",
        whatsappPhone: PHONE,
        playlistUrl: null,
      });

      for (const whatsappPhone of [null, ""]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Cancun",
          whatsappPhone,
          playlistUrl: null,
        });

        assert.equal(response.status, 200, String(whatsappPhone));
        assert.deepEqual(((await response.json()) as Row).featureSettings, {
          whatsappPhone: null,
          playlistUrl: null,
        });
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.whatsappPhone, null);
      }
    });

    it("clears the stored playlist link with null and with an empty value (F6; S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Cancun",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });

      for (const playlistUrl of [null, ""]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Cancun",
          whatsappPhone: PHONE,
          playlistUrl,
        });

        assert.equal(response.status, 200, String(playlistUrl));
        assert.deepEqual(((await response.json()) as Row).featureSettings, {
          whatsappPhone: PHONE,
          playlistUrl: null,
        });
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.playlistUrl, null);
      }
    });

    it("answers 400 INVALID_INVITATION_FEATURES with its issues and stores nothing (S4, S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      const refused: Array<[string, Record<string, unknown>, string[]]> = [
        [
          "a zone outside the allow-list",
          { timeZone: "Europe/Madrid", whatsappPhone: null, playlistUrl: null },
          ["timeZone must be one of the supported time zones"],
        ],
        [
          "a phone it cannot normalize",
          { timeZone: "America/Mexico_City", whatsappPhone: "12345", playlistUrl: null },
          [
            "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          ],
        ],
        [
          "a phone that is not a string",
          { timeZone: "America/Mexico_City", whatsappPhone: 5512345678, playlistUrl: null },
          ["whatsappPhone must be a string or null"],
        ],
        [
          "a link that is not https",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: "http://open.spotify.com/playlist/abc",
          },
          ["playlistUrl must be an https link"],
        ],
        [
          "a link on another host",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: "https://example.com/playlist/abc",
          },
          ["playlistUrl must link to Spotify, Apple Music, YouTube, Deezer, or SoundCloud"],
        ],
        [
          "a link that is not a string",
          { timeZone: "America/Mexico_City", whatsappPhone: null, playlistUrl: 42 },
          ["playlistUrl must be a string or null"],
        ],
        [
          "every value wrong, the zone first and the playlist last",
          { timeZone: "not-a-zone", whatsappPhone: "12345", playlistUrl: "http://x.test" },
          [
            "timeZone must be one of the supported time zones",
            "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
            "playlistUrl must be an https link",
          ],
        ],
      ];

      for (const [label, body, issues] of refused) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body);

        assert.equal(response.status, 400, label);
        assert.deepEqual(await response.json(), { code: "INVALID_INVITATION_FEATURES", issues });
      }
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("answers 400 for a body without a field or with an unknown field (S4, S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      for (const body of [
        {},
        { timeZone: "America/Mexico_City" },
        { whatsappPhone: null },
        // The old two-field body: `playlistUrl` is required like the other two, so the global pipe refuses it.
        { timeZone: "America/Mexico_City", whatsappPhone: null },
        {
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl: null,
          packageId: UNKNOWN_ID,
        },
        "not-json",
      ]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body);

        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("names playlistUrl when the body omits it (S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      // The client learns which field it forgot, so the refusal is actionable rather than a bare 400.
      assert.match(JSON.stringify(body), /playlistUrl/);
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps it unchanged (S7, A2)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("answers 404 for another customer's invitation and for an unknown id (A4)", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("PUT", `${PATH}/${id}/features`, other.cookie, {
          timeZone: "America/Tijuana",
          whatsappPhone: PHONE,
          playlistUrl: PLAYLIST,
        });

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });
  });

  describe("POST /invitations/:id/archive", () => {
    it("archives a DRAFT and answers 200 with the summary", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), SUMMARY_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "ARCHIVED");
      assert.equal(new Date(String(body.archivedAt)).toISOString(), body.archivedAt);
      assert.equal(body.ownerId, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.ok(stored?.archivedAt);
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for a repeated archive", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
    });

    it("answers 404 for another customer's invitation and keeps it a DRAFT", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, other.cookie);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.status, "DRAFT");
    });
  });

  describe("POST /invitations/:id/publish", () => {
    /** A draft that satisfies the pinned schema, so readiness passes and only the transition is observed. */
    async function publishableDraft(cookie: string) {
      const draft = await createDraft(cookie);
      const filled = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Cumpleaños de Ana" },
      });
      assert.equal(filled.status, 200);
      return draft;
    }

    it("publishes a ready DRAFT and answers 200 with the owned invitation and its publishedAt", async () => {
      const { userId, cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      const asked = paymentGate.asked;

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.expiresAt, undefined, "Milestone 5 never exposes an expiry (S8)");
      assert.equal(body.status, "PUBLISHED");
      assert.equal(new Date(String(body.publishedAt)).toISOString(), body.publishedAt);
      assert.deepEqual(body.missingRequiredFields, []);
      assert.equal(paymentGate.asked, asked + 1, "the payment gate is asked once (S6)");

      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.ok(stored);
      assert.equal(stored.ownerId, userId);
      assert.equal(stored.status, "PUBLISHED");
      assert.equal(stored.publishedAt?.toISOString(), body.publishedAt);
    });

    it("answers 409 INVITATION_NOT_PUBLISHABLE with its issues for an incomplete draft, and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        code: "INVITATION_NOT_PUBLISHABLE",
        issues: ["content.title is required to publish"],
      });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 409 INVITATION_ALREADY_PUBLISHED for a repeated publish", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      const first = await send("POST", `${PATH}/${draft.id}/publish`, cookie);
      assert.equal(first.status, 200);
      const publishedAt = ((await first.json()) as Row).publishedAt;

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_PUBLISHED" });
      assert.equal(
        repository.rows.find((row) => row.id === draft.id)?.publishedAt?.toISOString(),
        publishedAt,
        "the first publishedAt is kept",
      );
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation, and keeps it archived", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 402 INVITATION_PAYMENT_REQUIRED with the gate's reason and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      paymentGate.refusalReason = "SUBSCRIPTION_REQUIRED";

      try {
        const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

        assert.equal(response.status, 402);
        assert.deepEqual(await response.json(), {
          code: "INVITATION_PAYMENT_REQUIRED",
          reason: "SUBSCRIPTION_REQUIRED",
        });
        const stored = repository.rows.find((row) => row.id === draft.id);
        assert.equal(stored?.status, "DRAFT");
        assert.equal(stored?.publishedAt, null);
      } finally {
        paymentGate.refusalReason = null;
      }
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await publishableDraft(owner.cookie);

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("POST", `${PATH}/${id}/publish`, other.cookie);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });
  });

  describe("POST /invitations/:id/unpublish", () => {
    /** Publishes through the API, so the unpublish test starts from a row the transitions really produced. */
    async function publishedDraft(cookie: string) {
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      return draft;
    }

    it("returns a PUBLISHED invitation to DRAFT and answers 200 with the summary", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishedDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), SUMMARY_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.publishedAt, null);
      assert.equal(body.archivedAt, null);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.expiresAt, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 409 INVITATION_NOT_PUBLISHED for a draft that was never published, and changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_PUBLISHED" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.status, "DRAFT");
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation, and keeps it archived", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishedDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await publishedDraft(owner.cookie);
      const publishedAt = repository.rows.find((row) => row.id === draft.id)?.publishedAt;

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("POST", `${PATH}/${id}/unpublish`, other.cookie);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "PUBLISHED");
      assert.equal(stored?.publishedAt, publishedAt);
    });
  });

  describe("GET /public/invitations/:slug", () => {
    const PUBLIC_PATH = "/public/invitations";
    /** Every key a guest receives (A7, S4): nothing else may appear. */
    const PUBLIC_KEYS = [
      "componentKey",
      "configuration",
      "content",
      "features",
      "publishedAt",
      "slug",
      "timeZone",
    ];
    /** Everything a public body must never carry: owner, package, price, status, ids, and the expiry (A7, S8). */
    const PRIVATE_KEYS = [
      "archivedAt",
      "createdAt",
      "expiresAt",
      "id",
      "missingRequiredFields",
      "ownerId",
      "packageId",
      "status",
      "templateVersionId",
      "updatedAt",
    ];

    /**
     * A stored row inserted directly, because the public read is the only thing under test here: the owner
     * routes already write these states. `content` keeps one undeclared key (`subtitle`), so the projection
     * that drops it is observed (A7).
     */
    function seed(overrides: {
      slug: string;
      status: InvitationStatus;
      templateVersionId?: string;
      packageId?: string;
      expiresAt?: Date | null;
      timeZone?: string;
      whatsappPhone?: string | null;
      playlistUrl?: string | null;
      rsvpDeadline?: Date | null;
      rsvpPartyLimit?: number;
    }): InvitationRecord {
      const at = new Date(Date.UTC(2026, 9, 12, 9, 0, 0));
      const row: InvitationRecord = {
        id: randomUUID(),
        ownerId: randomUUID(),
        templateVersionId: overrides.templateVersionId ?? PUBLISHED_VERSION_ID,
        packageId: overrides.packageId ?? ACTIVE_PACKAGE_ID,
        slug: overrides.slug,
        status: overrides.status,
        content: { title: "Cumpleaños de Ana", subtitle: "una nota que el esquema no declara" },
        timeZone: overrides.timeZone ?? "America/Mexico_City",
        whatsappPhone: overrides.whatsappPhone ?? null,
        playlistUrl: overrides.playlistUrl ?? null,
        rsvpDeadline: overrides.rsvpDeadline ?? null,
        rsvpPartyLimit: overrides.rsvpPartyLimit ?? 4,
        archivedAt: overrides.status === "ARCHIVED" ? at : null,
        publishedAt: overrides.status === "PUBLISHED" ? at : null,
        expiresAt: overrides.expiresAt ?? null,
        createdAt: at,
        updatedAt: at,
      };
      repository.rows.push(row);
      return row;
    }

    it("answers exactly the public projection, without any session", async () => {
      const row = seed({ slug: "invitacion-k7m2qx", status: "PUBLISHED" });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.equal(body.slug, row.slug);
      assert.equal(body.componentKey, RENDERER);
      assert.deepEqual(body.configuration, { componentKey: RENDERER });
      // Only the keys the pinned schema declares; the stored `subtitle` never reaches a guest (A7).
      assert.deepEqual(body.content, { title: "Cumpleaños de Ana" });
      assert.equal(body.timeZone, "America/Mexico_City");
      // The fixture's package includes no catalog feature, so only the calendar is left (S4).
      assert.deepEqual(body.features, {
        countdown: false,
        map: false,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      assert.equal(new Date(String(body.publishedAt)).toISOString(), body.publishedAt);
      for (const key of PRIVATE_KEYS) {
        assert.equal(body[key], undefined, key);
      }
      assert.equal(
        JSON.stringify(body).includes(row.ownerId),
        false,
        "the owner id never reaches a guest",
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
    });

    it("serves the same page with a valid session and with a forged cookie, never reading one", async () => {
      const { cookie } = await signedInCustomer();
      const row = seed({ slug: "invitacion-cookie", status: "PUBLISHED" });

      for (const header of [
        undefined,
        `${SESSION_COOKIE}=forged.value`,
        `${cookie.slice(0, -4)}AAAA`,
        cookie,
      ]) {
        const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`, header);

        assert.equal(response.status, 200, String(header));
        assert.deepEqual(Object.keys((await response.json()) as Row).sort(), PUBLIC_KEYS);
      }
    });

    it("answers one identical uncacheable 404 for a malformed, unknown, draft, archived, expired, or unrenderable slug (A3)", async () => {
      const cases: Array<[string, string]> = [
        ["malformed", "Invitacion-K7M2QX"],
        ["unknown", "invitacion-never0"],
        ["draft", seed({ slug: "invitacion-draft0", status: "DRAFT" }).slug],
        ["archived", seed({ slug: "invitacion-archiv", status: "ARCHIVED" }).slug],
        [
          "expired",
          seed({
            slug: "invitacion-expird",
            status: "PUBLISHED",
            expiresAt: new Date(Date.now() - 1_000),
          }).slug,
        ],
        [
          "unregistered renderer",
          seed({
            slug: "invitacion-norend",
            status: "PUBLISHED",
            templateVersionId: UNRENDERABLE_VERSION_ID,
          }).slug,
        ],
        [
          "pinned version missing",
          seed({ slug: "invitacion-novers", status: "PUBLISHED", templateVersionId: UNKNOWN_ID })
            .slug,
        ],
      ];
      const answers = new Map<string, Row>();

      for (const [label, slug] of cases) {
        const response = await send("GET", `${PUBLIC_PATH}/${slug}`);
        answers.set(label, {
          status: response.status,
          body: await response.json(),
          cacheControl: response.headers.get("cache-control"),
        });
      }

      const [expected] = [...answers.values()];
      assert.deepEqual(expected, {
        status: 404,
        body: { code: "PUBLIC_INVITATION_NOT_FOUND" },
        cacheControl: "no-store",
      });
      for (const [label, answer] of answers) {
        assert.deepEqual(answer, expected, label);
      }
    });

    it("logs one structured line for a renderer the API does not know, with no content and no owner", async () => {
      const row = seed({
        slug: "invitacion-norend2",
        status: "PUBLISHED",
        templateVersionId: UNRENDERABLE_VERSION_ID,
      });
      const recorded: unknown[][] = [];
      const spy = mock.method(Logger.prototype, "warn", (...args: unknown[]) => {
        recorded.push(args);
      });

      try {
        const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
      } finally {
        spy.mock.restore();
      }

      const lines = recorded.filter(
        ([first]) =>
          (first as { event?: string } | undefined)?.event === "public-invitation-not-renderable",
      );
      assert.equal(lines.length, 1, "the fault is reported once");
      const event = lines[0]?.[0] as Row;
      assert.deepEqual(Object.keys(event).sort(), ["componentKey", "event", "slug"]);
      assert.equal(event.componentKey, UNREGISTERED_RENDERER);
      assert.equal(event.slug, row.slug);
      const text = JSON.stringify(event);
      assert.equal(text.includes(row.ownerId), false, "the owner is never logged");
      assert.equal(text.includes("Cumpleaños"), false, "the content is never logged");
    });

    it("answers the time zone and the gated features, and nothing about the package (F1; S4)", async () => {
      const row = seed({
        slug: "invitacion-feat01",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual(body.features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
        music: null,
        giftRegistry: false,
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      // No package key list, name, or id reaches a guest; only the gated result does (S4, A7).
      const text = JSON.stringify(body);
      for (const leaked of ["COUNTDOWN", "WHATSAPP", "MAP", FEATURE_PACKAGE_ID]) {
        assert.equal(text.includes(leaked), false, leaked);
      }
    });

    it("answers the music link and the gift registry only for a package that grants them (F6, F7; S7)", async () => {
      const row = seed({
        slug: "invitacion-feat03",
        status: "PUBLISHED",
        packageId: MUSIC_PACKAGE_ID,
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.deepEqual(body.features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
        music: { url: PLAYLIST, provider: "spotify" },
        giftRegistry: true,
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      assert.equal(JSON.stringify(body).includes(MUSIC_PACKAGE_ID), false);
    });

    it("keeps a stored link private when the package does not grant music (F6; S7)", async () => {
      const row = seed({
        slug: "invitacion-feat04",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        playlistUrl: PLAYLIST,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual((body.features as Row).music, null);
      assert.equal(JSON.stringify(body).includes("spotify"), false);
      assert.equal(JSON.stringify(body).includes(PLAYLIST), false);
    });

    it("drops WhatsApp while no phone is stored, whatever the package includes (S4)", async () => {
      const row = seed({
        slug: "invitacion-feat02",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      assert.deepEqual(((await response.json()) as Row).features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
    });

    it("answers the RSVP mode the pinned package grants, with the deadline and the party limit (M6 G1)", async () => {
      const deadline = new Date("2026-12-31T23:59:59.000Z");
      const open = seed({
        slug: "invitacion-rsvp01",
        status: "PUBLISHED",
        packageId: RSVP_PACKAGE_ID,
        rsvpDeadline: deadline,
        rsvpPartyLimit: 6,
      });
      const guestList = seed({
        slug: "invitacion-rsvp02",
        status: "PUBLISHED",
        packageId: GUEST_LIST_PACKAGE_ID,
      });

      const openBody = (await (await send("GET", `${PUBLIC_PATH}/${open.slug}`)).json()) as Row;
      assert.deepEqual((openBody.features as Row).rsvp, {
        mode: "open",
        deadline: deadline.toISOString(),
        partyLimit: 6,
        qrPass: false,
      });
      assert.equal(JSON.stringify(openBody).includes("RSVP"), false, "the key list stays private");

      const guestListBody = (await (
        await send("GET", `${PUBLIC_PATH}/${guestList.slug}`)
      ).json()) as Row;
      assert.deepEqual((guestListBody.features as Row).rsvp, {
        mode: "guest-list",
        deadline: null,
        partyLimit: 4,
        qrPass: false,
      });
    });

    it("stops resolving the slug after unpublishing and resolves it again after republishing (S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });

      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      const published = await send("GET", `${PUBLIC_PATH}/${draft.slug}`);
      assert.equal(published.status, 200);
      assert.equal(((await published.json()) as Row).slug, draft.slug);

      assert.equal((await send("POST", `${PATH}/${draft.id}/unpublish`, cookie)).status, 200);
      const unpublished = await send("GET", `${PUBLIC_PATH}/${draft.slug}`);
      assert.equal(unpublished.status, 404);
      assert.deepEqual(await unpublished.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });

      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      assert.equal((await send("GET", `${PUBLIC_PATH}/${draft.slug}`)).status, 200);
    });
  });

  describe("RSVP creator routes (M6 G1; S1, S4)", () => {
    /** A DRAFT pinned to the given package, with content that publishes, as the owner routes leave it. */
    async function draft(cookie: string, packageId: string) {
      const response = await send("POST", PATH, cookie, {
        templateVersionId: PUBLISHED_VERSION_ID,
        packageId,
      });
      assert.equal(response.status, 201);
      const created = (await response.json()) as Row & { id: string; slug: string };
      assert.equal(
        (await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } }))
          .status,
        200,
      );
      return created;
    }

    describe("PUT /invitations/:id/rsvp-settings", () => {
      it("stores the deadline and the party limit and answers them", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);

        const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });
        const stored = repository.rows.find((row) => row.id === created.id);
        assert.equal(stored?.rsvpPartyLimit, 6);
        assert.equal(stored?.rsvpDeadline?.toISOString(), "2026-12-31T23:59:59.000Z");
      });

      it("clears the deadline with null", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });

        const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: null,
          partyLimit: 4,
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { deadline: null, partyLimit: 4 });
        assert.equal(repository.rows.find((row) => row.id === created.id)?.rsvpDeadline, null);
      });

      it("answers 400 INVALID_RSVP_SETTINGS with its issues and stores nothing", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        const before = structuredClone(repository.rows.find((row) => row.id === created.id));

        const refused: Array<[string, Record<string, unknown>, string[]]> = [
          [
            "a deadline that is not an instant",
            { deadline: "2026-12-31", partyLimit: 4 },
            ["deadline must be an ISO 8601 instant with an offset, or null"],
          ],
          [
            "a party limit of 0",
            { deadline: null, partyLimit: 0 },
            ["partyLimit must be between 1 and 10"],
          ],
          [
            "a party limit of 11",
            { deadline: null, partyLimit: 11 },
            ["partyLimit must be between 1 and 10"],
          ],
          [
            "a party limit that is not an integer",
            { deadline: null, partyLimit: 4.5 },
            ["partyLimit must be an integer"],
          ],
          [
            "both values wrong, the deadline first",
            { deadline: "someday", partyLimit: 11 },
            [
              "deadline must be an ISO 8601 instant with an offset, or null",
              "partyLimit must be between 1 and 10",
            ],
          ],
        ];

        for (const [label, body, issues] of refused) {
          const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, body);

          assert.equal(response.status, 400, label);
          assert.deepEqual(await response.json(), { code: "INVALID_RSVP_SETTINGS", issues });
        }
        assert.deepEqual(
          repository.rows.find((row) => row.id === created.id),
          before,
        );
      });

      it("answers 400 for a body without a field or with an unknown field", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        const before = structuredClone(repository.rows.find((row) => row.id === created.id));

        for (const body of [
          {},
          { deadline: null },
          { partyLimit: 4 },
          { deadline: null, partyLimit: 4, whatsappPhone: null },
          "not-json",
        ]) {
          const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, body);
          assert.equal(response.status, 400, JSON.stringify(body));
        }
        assert.deepEqual(
          repository.rows.find((row) => row.id === created.id),
          before,
        );
      });

      it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps its settings", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        assert.equal((await send("POST", `${PATH}/${created.id}/archive`, cookie)).status, 200);

        const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: null,
          partyLimit: 9,
        });

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
        assert.equal(repository.rows.find((row) => row.id === created.id)?.rsvpPartyLimit, 4);
      });

      it("answers 404 for another customer's invitation and for an unknown id", async () => {
        const owner = await signedInCustomer();
        const other = await signedInCustomer();
        const created = await draft(owner.cookie, RSVP_PACKAGE_ID);

        for (const id of [created.id, UNKNOWN_ID]) {
          const response = await send("PUT", `${PATH}/${id}/rsvp-settings`, other.cookie, {
            deadline: null,
            partyLimit: 9,
          });

          assert.equal(response.status, 404, id);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
        }
        assert.equal(repository.rows.find((row) => row.id === created.id)?.rsvpPartyLimit, 4);
      });
    });

    describe("GET /invitations/:id/rsvp", () => {
      it("answers the settings, the responses newest first, and the totals", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });
        const older = rsvpRepository.seedResponse(created.id, {
          name: "Vieja",
          attending: true,
          partySize: 3,
          createdAt: new Date("2026-11-18T10:00:00.000Z"),
        });
        const newer = rsvpRepository.seedResponse(created.id, {
          name: "Nueva",
          attending: false,
          partySize: 0,
          phone: null,
          createdAt: new Date("2026-11-19T10:00:00.000Z"),
        });

        const response = await send("GET", `${PATH}/${created.id}/rsvp`, cookie);

        assert.equal(response.status, 200);
        const body = (await response.json()) as Row;
        assert.deepEqual(Object.keys(body).sort(), ["responses", "settings", "totals"]);
        assert.deepEqual(body.settings, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });
        assert.deepEqual(
          (body.responses as Row[]).map((item) => item.id),
          [newer.id, older.id],
        );
        assert.deepEqual(Object.keys((body.responses as Row[])[0] ?? {}).sort(), [
          "attending",
          "createdAt",
          "id",
          "message",
          "name",
          "partySize",
          "phone",
          "updatedAt",
        ]);
        assert.deepEqual(body.totals, { attendingPeople: 3, declinedCount: 1, responses: 2 });
        // Nothing internal travels: no dedupe key, no invitation id, no owner id.
        const text = JSON.stringify(body);
        for (const internal of ["dedupeKey", created.id, "invitationId", "ownerId"]) {
          assert.equal(text.includes(internal), false, internal);
        }
      });

      it("answers an empty read to an owner without responses", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);

        const response = await send("GET", `${PATH}/${created.id}/rsvp`, cookie);

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          settings: { deadline: null, partyLimit: 4 },
          responses: [],
          totals: { attendingPeople: 0, declinedCount: 0, responses: 0 },
        });
      });

      it("answers 404 for another customer's invitation and for an unknown id", async () => {
        const owner = await signedInCustomer();
        const other = await signedInCustomer();
        const created = await draft(owner.cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(created.id);

        for (const id of [created.id, UNKNOWN_ID]) {
          const response = await send("GET", `${PATH}/${id}/rsvp`, other.cookie);

          assert.equal(response.status, 404, id);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
        }
      });

      it("keeps two creators apart: each reads only the responses of their own invitation", async () => {
        const first = await signedInCustomer();
        const second = await signedInCustomer();
        const firstInvitation = await draft(first.cookie, RSVP_PACKAGE_ID);
        const secondInvitation = await draft(second.cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(firstInvitation.id, { name: "De la primera" });
        rsvpRepository.seedResponse(secondInvitation.id, { name: "De la segunda" });

        const read = (await (
          await send("GET", `${PATH}/${firstInvitation.id}/rsvp`, first.cookie)
        ).json()) as Row;

        assert.deepEqual(
          (read.responses as Row[]).map((item) => item.name),
          ["De la primera"],
        );
        assert.equal(JSON.stringify(read).includes("De la segunda"), false);
      });
    });

    describe("GET /invitations/:id/rsvp.csv", () => {
      it("answers an attachment with no-store and one escaped line per response, newest first", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(created.id, {
          name: "Vieja, Ana",
          partySize: 1,
          createdAt: new Date("2026-11-18T10:00:00.000Z"),
        });
        rsvpRepository.seedResponse(created.id, {
          name: "=Nueva",
          attending: false,
          partySize: 0,
          phone: null,
          message: 'Dijo: "sí"',
          createdAt: new Date("2026-11-19T10:00:00.000Z"),
        });

        const response = await send("GET", `${PATH}/${created.id}/rsvp.csv`, cookie);

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
        assert.equal(
          response.headers.get("content-disposition"),
          `attachment; filename="asistencia-${created.slug}.csv"`,
        );
        assert.equal(response.headers.get("cache-control"), "no-store");
        const lines = (await response.text()).split("\r\n");
        assert.equal(
          lines[0],
          "Nombre,Asistencia,Personas,Teléfono,Mensaje,Primera respuesta,Última actualización",
        );
        assert.equal(
          lines[1],
          `'=Nueva,No,0,,"Dijo: ""sí""",2026-11-19T10:00:00.000Z,2026-11-19T10:00:00.000Z`,
        );
        assert.equal(
          lines[2],
          '"Vieja, Ana",Sí,1,\'+525512345678,,2026-11-18T10:00:00.000Z,2026-11-18T10:00:00.000Z',
        );
      });

      it("answers only the header for an invitation without responses", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);

        const response = await send("GET", `${PATH}/${created.id}/rsvp.csv`, cookie);

        assert.equal(response.status, 200);
        assert.deepEqual((await response.text()).split("\r\n"), [
          "Nombre,Asistencia,Personas,Teléfono,Mensaje,Primera respuesta,Última actualización",
          "",
        ]);
      });

      it("answers 404 for another customer's invitation and for an unknown id", async () => {
        const owner = await signedInCustomer();
        const other = await signedInCustomer();
        const created = await draft(owner.cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(created.id);

        for (const id of [created.id, UNKNOWN_ID]) {
          const response = await send("GET", `${PATH}/${id}/rsvp.csv`, other.cookie);

          assert.equal(response.status, 404, id);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
          assert.equal(response.headers.get("cache-control"), "no-store");
        }
      });
    });
  });

  describe("POST /public/invitations/:slug/rsvp (M6 G1; S1, S4)", () => {
    const ATTEMPT = {
      name: "  Ana   Pérez ",
      attending: true,
      partySize: 2,
      phone: "55 1234 5678",
      message: "  ¡Con gusto! ",
      honeypot: "",
    };

    /** A published invitation of the given package, created through the owner routes. */
    async function published(packageId: string = RSVP_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId,
        })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      return { cookie, created };
    }

    const submit = (slug: string, body: unknown, headers: Record<string, string> = {}) =>
      send("POST", `/public/invitations/${slug}/rsvp`, undefined, body, headers);

    it("stores the response and answers the same minimal 202 as a retry", async () => {
      const { created } = await published();

      const response = await submit(created.slug, ATTEMPT);

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      const stored = rsvpRepository.responses.filter((item) => item.invitationId === created.id);
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.name, "Ana Pérez");
      assert.equal(stored[0]?.dedupeKey, "ana perez|+525512345678");
      assert.equal(stored[0]?.phone, "+525512345678");
      assert.equal(stored[0]?.message, "¡Con gusto!");

      // A retry with the same normalized name and phone updates the row and answers the same 202.
      const retry = await submit(created.slug, { ...ATTEMPT, name: "ANA PEREZ", partySize: 4 });
      assert.equal(retry.status, 202);
      assert.deepEqual(await retry.json(), { status: "received" });
      const afterRetry = rsvpRepository.responses.filter(
        (item) => item.invitationId === created.id,
      );
      assert.equal(afterRetry.length, 1);
      assert.equal(afterRetry[0]?.partySize, 4);
      assert.equal(afterRetry[0]?.id, stored[0]?.id);
    });

    it("answers the same 202 without storing when the honeypot is filled", async () => {
      const { created } = await published();

      const response = await submit(created.slug, {
        ...ATTEMPT,
        name: "",
        honeypot: "https://spam.example",
      });

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
    });

    it("answers 400 INVALID_RSVP with the domain issues and stores nothing", async () => {
      const { cookie, created } = await published();
      await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
        deadline: null,
        partyLimit: 2,
      });

      const refused: Array<[string, Record<string, unknown>, string[]]> = [
        ["an empty name", { ...ATTEMPT, name: "" }, ["name must be between 1 and 80 characters"]],
        [
          "a party above the invitation's limit",
          { ...ATTEMPT, partySize: 3 },
          ["partySize must be between 1 and 2 when attending"],
        ],
        [
          "a declined response that still names people",
          { ...ATTEMPT, attending: false, partySize: 2 },
          ["partySize must be 0 when not attending"],
        ],
        [
          "a phone it cannot normalize",
          { ...ATTEMPT, phone: "12345" },
          [
            "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          ],
        ],
        [
          "a message above the limit",
          { ...ATTEMPT, message: "x".repeat(281) },
          ["message must be at most 280 characters"],
        ],
      ];

      for (const [label, body, issues] of refused) {
        const response = await submit(created.slug, body);

        assert.equal(response.status, 400, label);
        assert.deepEqual(await response.json(), { code: "INVALID_RSVP", issues });
      }
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
    });

    it("answers 400 for an unknown field or a value the DTO refuses, and stores nothing", async () => {
      const { created } = await published();

      for (const body of [
        { ...ATTEMPT, ownerId: UNKNOWN_ID },
        { ...ATTEMPT, attending: "yes" },
        { ...ATTEMPT, partySize: "2" },
        { name: "Ana" },
        "not-json",
      ]) {
        const response = await submit(created.slug, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
    });

    it("answers the public 404 for a malformed, unknown, draft, or archived slug, without a session", async () => {
      const { cookie } = await signedInCustomer();
      const draftInvitation = (await (
        await send("POST", PATH, cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId: RSVP_PACKAGE_ID,
        })
      ).json()) as Row & { id: string; slug: string };
      const archived = await published();
      assert.equal(
        (await send("POST", `${PATH}/${archived.created.id}/archive`, archived.cookie)).status,
        200,
      );

      for (const slug of [
        "Invitacion-Malformed",
        "invitacion-never0",
        draftInvitation.slug,
        archived.created.slug,
      ]) {
        const response = await submit(slug, ATTEMPT);

        assert.equal(response.status, 404, slug);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    });

    it("answers 409 RSVP_NOT_OPEN for a guest list, a package without RSVP, and a deadline that passed", async () => {
      const guestList = await published(GUEST_LIST_PACKAGE_ID);
      assert.equal((await submit(guestList.created.slug, ATTEMPT)).status, 409);
      assert.deepEqual(await (await submit(guestList.created.slug, ATTEMPT)).json(), {
        code: "RSVP_NOT_OPEN",
      });

      const basic = await published(ACTIVE_PACKAGE_ID);
      const basicResponse = await submit(basic.created.slug, ATTEMPT);
      assert.equal(basicResponse.status, 409);
      assert.deepEqual(await basicResponse.json(), { code: "RSVP_NOT_OPEN" });

      const closed = await published();
      assert.equal(
        (
          await send("PUT", `${PATH}/${closed.created.id}/rsvp-settings`, closed.cookie, {
            deadline: "2020-01-01T00:00:00.000Z",
            partyLimit: 4,
          })
        ).status,
        200,
      );
      const closedResponse = await submit(closed.created.slug, ATTEMPT);
      assert.equal(closedResponse.status, 409);
      assert.deepEqual(await closedResponse.json(), { code: "RSVP_NOT_OPEN" });

      for (const invitation of [guestList, basic, closed]) {
        assert.equal(
          rsvpRepository.responses.some((item) => item.invitationId === invitation.created.id),
          false,
        );
      }
    });

    it("answers 429 RSVP_RATE_LIMITED when the address is over the cap, and stores nothing", async () => {
      const { created } = await published();
      rateLimiter.allow = false;

      try {
        const response = await submit(created.slug, ATTEMPT);

        assert.equal(response.status, 429);
        assert.deepEqual(await response.json(), { code: "RSVP_RATE_LIMITED" });
        assert.equal(
          rsvpRepository.responses.some((item) => item.invitationId === created.id),
          false,
        );
      } finally {
        rateLimiter.allow = true;
      }
    });

    it("counts each client address separately, from the configured header", async () => {
      const { created } = await published();
      rateLimiter.consumed.length = 0;

      await submit(created.slug, ATTEMPT, { "x-forwarded-for": "198.18.0.21" });
      await submit(
        created.slug,
        { ...ATTEMPT, name: "Otra" },
        {
          "x-forwarded-for": "198.18.0.21, 10.0.0.1",
        },
      );
      await submit(
        created.slug,
        { ...ATTEMPT, name: "Tercera" },
        {
          "x-forwarded-for": "198.18.0.22",
        },
      );

      assert.deepEqual(
        rateLimiter.consumed.map((item) => item.clientAddress),
        ["198.18.0.21", "198.18.0.21", "198.18.0.22"],
      );
      for (const item of rateLimiter.consumed) {
        assert.equal(item.invitationId, created.id);
      }
    });

    it("serves the same answer with a forged cookie, never reading a session", async () => {
      const { created } = await published();

      const response = await send(
        "POST",
        `/public/invitations/${created.slug}/rsvp`,
        `${SESSION_COOKIE}=forged.value`,
        { ...ATTEMPT, name: "Con cookie" },
      );

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
    });

    it("never returns another guest's data or any administrative field", async () => {
      const { created } = await published();
      await submit(created.slug, ATTEMPT);
      const first = rsvpRepository.responses[0] as RsvpResponseRecord;

      const response = await submit(created.slug, {
        ...ATTEMPT,
        name: "Otra Persona",
        phone: null,
      });

      assert.equal(response.status, 202);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { status: "received" });
      for (const leaked of [
        "Ana",
        "+525512345678",
        first.id,
        created.id,
        created.slug,
        "ownerId",
        "dedupeKey",
      ]) {
        assert.equal(text.includes(leaked), false, leaked);
      }
    });
  });

  /** The guests the shared memory port holds for one invitation, so the assertions are not suite-wide. */
  const guestsOf = (invitationId: string) =>
    guestRepository.guests.filter((row) => row.invitationId === invitationId);
  /** The stored answers of one guest. */
  const responsesOf = (guestId: string) =>
    guestRepository.responses.filter((row) => row.guestId === guestId);

  describe("guest list creator routes (M6 G2; S1, S3, S4)", () => {
    /** A published invitation of the given package, created through the owner routes. */
    async function owned(cookie: string, packageId: string = QR_PASS_PACKAGE_ID) {
      const created = (await (
        await send("POST", PATH, cookie, { templateVersionId: PUBLISHED_VERSION_ID, packageId })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      return created;
    }

    const GUEST = { name: "  Ana   Pérez ", seats: 3, phone: "55 1234 5678", note: " Mesa 4 " };

    async function addGuest(cookie: string, id: string, body: unknown = GUEST) {
      const response = await send("POST", `${PATH}/${id}/guests`, cookie, body);
      assert.equal(response.status, 201, JSON.stringify(await response.clone().text()));
      return (await response.json()) as Row & { token: string; guest: Row & { id: string } };
    }

    it("creates a guest, answers the plain token once, and never returns it from the read", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, GUEST);

      assert.equal(response.status, 201);
      const body = (await response.json()) as Row & { token: string; guest: Row };
      assert.equal(typeof body.token, "string");
      assert.equal((body.token as string).length, 22);
      assert.deepEqual(Object.keys(body.guest).sort(), [
        "checkedInAt",
        "createdAt",
        "id",
        "name",
        "note",
        "phone",
        "response",
        "seats",
        "tokenIssuedAt",
        "updatedAt",
      ]);
      assert.equal(body.guest.name, "Ana Pérez");
      assert.equal(body.guest.seats, 3);
      assert.equal(body.guest.phone, "+525512345678");
      assert.equal(body.guest.note, "Mesa 4");
      assert.equal(body.guest.response, null);
      assert.equal(body.guest.checkedInAt, null);

      const read = await send("GET", `${PATH}/${created.id}/guests`, cookie);
      assert.equal(read.status, 200);
      const list = (await read.json()) as Row;
      assert.deepEqual(Object.keys(list).sort(), ["guests", "totals"]);
      assert.deepEqual(list.totals, {
        guests: 1,
        seats: 3,
        attendingGuests: 0,
        attendingPeople: 0,
        declinedCount: 0,
        pendingCount: 1,
        checkedInCount: 0,
      });
      const text = JSON.stringify(list);
      assert.equal(text.includes(body.token), false, "the plain token is answered once");
      for (const internal of ["tokenHash", "dedupeKey", "invitationId", "ownerId"]) {
        assert.equal(text.includes(internal), false, internal);
      }
    });

    it("answers 400 INVALID_GUEST with the domain issues and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      const refused: Array<[Record<string, unknown>, string[]]> = [
        [{ ...GUEST, name: "" }, ["name must be between 1 and 80 characters"]],
        [{ ...GUEST, seats: 0 }, ["seats must be between 1 and 10"]],
        [{ ...GUEST, seats: 11 }, ["seats must be between 1 and 10"]],
        [{ ...GUEST, seats: 2.5 }, ["seats must be an integer"]],
        [
          { ...GUEST, phone: "12345" },
          [
            "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          ],
        ],
        [{ ...GUEST, note: "n".repeat(201) }, ["note must be at most 200 characters"]],
        [
          { name: "", seats: 0, phone: "12345", note: "n".repeat(201) },
          [
            "name must be between 1 and 80 characters",
            "seats must be between 1 and 10",
            "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
            "note must be at most 200 characters",
          ],
        ],
      ];

      for (const [body, issues] of refused) {
        const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { code: "INVALID_GUEST", issues });
      }
      assert.equal(guestsOf(created.id).length, 0);
    });

    it("answers 400 for a body with an unknown field or without a field", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      for (const body of [
        { ...GUEST, ownerId: UNKNOWN_ID },
        { ...GUEST, token: "A".repeat(22) },
        { name: "Ana" },
        {},
        "not-json",
      ]) {
        const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(guestsOf(created.id).length, 0);
    });

    it("answers 409 GUEST_LIST_NOT_AVAILABLE for a package without the guest list", async () => {
      const { cookie } = await signedInCustomer();
      const premium = await owned(cookie, RSVP_PACKAGE_ID);

      for (const [method, path, body] of [
        ["GET", `${PATH}/${premium.id}/guests`, undefined],
        ["POST", `${PATH}/${premium.id}/guests`, GUEST],
        ["PUT", `${PATH}/${premium.id}/guests/${UNKNOWN_ID}`, GUEST],
        ["DELETE", `${PATH}/${premium.id}/guests/${UNKNOWN_ID}`, undefined],
        ["POST", `${PATH}/${premium.id}/guests/${UNKNOWN_ID}/token`, undefined],
      ] as const) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 409, `${method} ${path}`);
        assert.deepEqual(await response.json(), { code: "GUEST_LIST_NOT_AVAILABLE" });
      }
      assert.equal(guestsOf(premium.id).length, 0);
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps the list readable", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);
      assert.equal((await send("POST", `${PATH}/${created.id}/archive`, cookie)).status, 200);

      for (const [method, path, body] of [
        ["POST", `${PATH}/${created.id}/guests`, GUEST],
        ["PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, GUEST],
        ["DELETE", `${PATH}/${created.id}/guests/${guest.guest.id}`, undefined],
        ["POST", `${PATH}/${created.id}/guests/${guest.guest.id}/token`, undefined],
        ["POST", `${PATH}/${created.id}/guests/check-in`, { token: guest.token }],
      ] as const) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 409, `${method} ${path}`);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      }
      const read = await send("GET", `${PATH}/${created.id}/guests`, cookie);
      assert.equal(read.status, 200);
      const kept = (await read.json()) as Row & { guests: Row[] };
      assert.equal(kept.guests.length, 1);
    });

    it("reads the guests with their answers, the check-in state, and the totals", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const first = await addGuest(cookie, created.id, { ...GUEST, name: "Ana" });
      const second = await addGuest(cookie, created.id, {
        ...GUEST,
        name: "Beto",
        seats: 2,
        phone: null,
        note: null,
      });
      guestRepository.seedResponse(first.guest.id, { attending: true, partySize: 3 });
      guestRepository.seedResponse(second.guest.id, {
        attending: false,
        partySize: 0,
        message: null,
      });
      const checkedIn = guestRepository.guests.find((row) => row.id === first.guest.id);
      assert.ok(checkedIn);
      checkedIn.checkedInAt = new Date("2026-11-20T20:00:00.000Z");

      const response = await send("GET", `${PATH}/${created.id}/guests`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(body.totals, {
        guests: 2,
        seats: 5,
        attendingGuests: 1,
        attendingPeople: 3,
        declinedCount: 1,
        pendingCount: 0,
        checkedInCount: 1,
      });
      const guests = body.guests as Row[];
      assert.deepEqual(
        guests.map((guest) => guest.name),
        ["Beto", "Ana"],
      );
      assert.deepEqual(Object.keys(guests[1]?.response as Row).sort(), [
        "attending",
        "createdAt",
        "message",
        "partySize",
        "updatedAt",
      ]);
      assert.equal(guests[1]?.checkedInAt, "2026-11-20T20:00:00.000Z");
      assert.equal(guests[0]?.response !== null, true);
    });

    it("edits a guest, refuses a seat count below the confirmed party, and answers 404 for a stranger", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id, { ...GUEST, seats: 3 });

      const edited = await send("PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie, {
        name: "Ana María",
        seats: 5,
        phone: null,
        note: null,
      });
      assert.equal(edited.status, 200);
      const body = (await edited.json()) as Row;
      assert.equal(body.name, "Ana María");
      assert.equal(body.seats, 5);
      assert.equal(body.phone, null);
      assert.equal(body.note, null);

      guestRepository.seedResponse(guest.guest.id, { attending: true, partySize: 4 });
      const refused = await send("PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie, {
        name: "Ana María",
        seats: 2,
        phone: null,
        note: null,
      });
      assert.equal(refused.status, 409);
      assert.deepEqual(await refused.json(), { code: "GUEST_SEATS_BELOW_RESPONSE", partySize: 4 });
      assert.equal(guestRepository.guests.find((row) => row.id === guest.guest.id)?.seats, 5);

      const other = await signedInCustomer();
      for (const id of [created.id, UNKNOWN_ID]) {
        const stranger = await send("PUT", `${PATH}/${id}/guests/${guest.guest.id}`, other.cookie, {
          name: "Intruso",
          seats: 1,
          phone: null,
          note: null,
        });
        assert.equal(stranger.status, 404, id);
        assert.deepEqual(await stranger.json(), { code: "INVITATION_NOT_FOUND" });
      }
    });

    it("removes a guest together with their answer and answers 404 for an unknown one", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);
      guestRepository.seedResponse(guest.guest.id);

      const response = await send(
        "DELETE",
        `${PATH}/${created.id}/guests/${guest.guest.id}`,
        cookie,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "deleted" });
      assert.equal(guestsOf(created.id).length, 0);
      assert.equal(responsesOf(guest.guest.id).length, 0);

      const again = await send("DELETE", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie);
      assert.equal(again.status, 404);
      assert.deepEqual(await again.json(), { code: "GUEST_NOT_FOUND" });
    });

    it("rotates the personal token, so the previous link stops resolving", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);

      const rotated = await send(
        "POST",
        `${PATH}/${created.id}/guests/${guest.guest.id}/token`,
        cookie,
      );

      assert.equal(rotated.status, 200);
      const body = (await rotated.json()) as Row & { token: string };
      assert.equal((body.token as string).length, 22);
      assert.notEqual(body.token, guest.token);
      assert.equal(JSON.stringify(body.guest).includes(body.token), false);

      const oldLink = await send(
        "GET",
        `/public/invitations/${created.slug}/guests/${guest.token}`,
      );
      assert.equal(oldLink.status, 404);
      const newLink = await send("GET", `/public/invitations/${created.slug}/guests/${body.token}`);
      assert.equal(newLink.status, 200);
    });

    it("checks a confirmed guest in once and answers the party of the first check-in", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id, { ...GUEST, seats: 3 });
      guestRepository.seedResponse(guest.guest.id, { attending: true, partySize: 2 });

      const first = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: guest.token,
      });

      assert.equal(first.status, 200);
      const body = (await first.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), [
        "attendingPartySize",
        "checkedInAt",
        "guestId",
        "name",
        "seats",
      ]);
      assert.equal(body.guestId, guest.guest.id);
      assert.equal(body.name, "Ana Pérez");
      assert.equal(body.seats, 3);
      assert.equal(body.attendingPartySize, 2);
      const checkedInAt = body.checkedInAt;

      const second = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: guest.token,
      });
      assert.equal(second.status, 200);
      assert.equal(((await second.json()) as Row).checkedInAt, checkedInAt);
      assert.equal(
        guestRepository.guests.find((row) => row.id === guest.guest.id)?.checkedInAt?.toISOString(),
        checkedInAt,
      );
    });

    it("refuses a check-in of an unconfirmed guest, an unknown token, and a package without the QR pass", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);

      const unconfirmed = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: guest.token,
      });
      assert.equal(unconfirmed.status, 409);
      assert.deepEqual(await unconfirmed.json(), { code: "GUEST_NOT_CONFIRMED" });

      const unknown = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: "Z".repeat(22),
      });
      assert.equal(unknown.status, 404);
      assert.deepEqual(await unknown.json(), { code: "GUEST_NOT_FOUND" });

      const malformed = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: "not-a-token",
      });
      assert.equal(malformed.status, 404);
      assert.deepEqual(await malformed.json(), { code: "GUEST_NOT_FOUND" });

      const noQr = await owned(cookie, GUEST_LIST_PACKAGE_ID);
      const plain = await addGuest(cookie, noQr.id);
      guestRepository.seedResponse(plain.guest.id);
      const refused = await send("POST", `${PATH}/${noQr.id}/guests/check-in`, cookie, {
        token: plain.token,
      });
      assert.equal(refused.status, 409);
      assert.deepEqual(await refused.json(), { code: "QR_PASS_NOT_AVAILABLE" });

      const other = await signedInCustomer();
      const stranger = await send("POST", `${PATH}/${created.id}/guests/check-in`, other.cookie, {
        token: guest.token,
      });
      assert.equal(stranger.status, 404);
      assert.deepEqual(await stranger.json(), { code: "INVITATION_NOT_FOUND" });
    });

    it("exports the guest list in guest-list mode and keeps the open form's export otherwise", async () => {
      const { cookie } = await signedInCustomer();
      const guestList = await owned(cookie);
      const guest = await addGuest(cookie, guestList.id, { ...GUEST, name: "Ana", seats: 3 });
      await addGuest(cookie, guestList.id, {
        ...GUEST,
        name: "Beto",
        seats: 1,
        phone: null,
        note: null,
      });
      guestRepository.seedResponse(guest.guest.id, { attending: true, partySize: 2 });

      const response = await send("GET", `${PATH}/${guestList.id}/rsvp.csv`, cookie);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(
        response.headers.get("content-disposition"),
        `attachment; filename="asistencia-${guestList.slug}.csv"`,
      );
      const lines = (await response.text()).split("\r\n");
      assert.equal(
        lines[0],
        "Nombre,Lugares,Asistencia,Personas,Teléfono,Nota,Mensaje,Primer check-in,Primera respuesta,Última actualización",
      );
      const beto = guestsOf(guestList.id).find((row) => row.name === "Beto");
      assert.deepEqual(lines.slice(1, 3).sort(), [
        "Ana,3,Sí,2,'+525512345678,Mesa 4,Vamos,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
        `Beto,1,Pendiente,,,,,,,${beto?.updatedAt.toISOString()}`,
      ]);

      // The open form keeps its own export (M6 G1 preserved).
      const premium = await owned(cookie, RSVP_PACKAGE_ID);
      rsvpRepository.seedResponse(premium.id, { name: "Abierta" });
      const open = await send("GET", `${PATH}/${premium.id}/rsvp.csv`, cookie);
      assert.equal(
        (await open.text()).split("\r\n")[0],
        "Nombre,Asistencia,Personas,Teléfono,Mensaje,Primera respuesta,Última actualización",
      );
    });
  });

  describe("public guest routes (M6 G2; S1, S4)", () => {
    const PUBLIC_PATH = "/public/invitations";

    /** A published invitation of the given package, created through the owner routes. */
    async function published(packageId: string = QR_PASS_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, { templateVersionId: PUBLISHED_VERSION_ID, packageId })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      const guest = guestRepository.seedGuest(created.id, {
        token: "A".repeat(22),
        name: "Ana",
        seats: 3,
        note: "Mesa 4",
      });
      return { cookie, created, guest };
    }

    const guestPath = (slug: string, token: string) => `${PUBLIC_PATH}/${slug}/guests/${token}`;

    it("answers the published page plus this guest, and nothing about another guest", async () => {
      const { created, guest } = await published();
      guestRepository.seedGuest(created.id, { token: "B".repeat(22), name: "Beto" });
      guestRepository.seedResponse(guest.id, {
        attending: true,
        partySize: 2,
        message: "Vamos",
      });

      const response = await send("GET", guestPath(created.slug, "A".repeat(22)));

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), [
        "componentKey",
        "configuration",
        "content",
        "features",
        "guest",
        "publishedAt",
        "slug",
        "timeZone",
      ]);
      assert.deepEqual(body.guest, {
        name: "Ana",
        seats: 3,
        response: { attending: true, partySize: 2, message: "Vamos" },
        qrPass: true,
      });
      assert.deepEqual((body.features as Row).rsvp, {
        mode: "guest-list",
        deadline: null,
        partyLimit: 4,
        qrPass: true,
      });
      const text = JSON.stringify(body);
      for (const secret of ["Beto", "A".repeat(22), guest.tokenHash, created.id, "tokenHash"]) {
        assert.equal(text.includes(secret), false, secret);
      }
    });

    it("offers the QR pass only to a confirmed guest whose package grants it", async () => {
      const noQr = await published(GUEST_LIST_PACKAGE_ID);
      guestRepository.seedResponse(noQr.guest.id);
      const page = (await (
        await send("GET", guestPath(noQr.created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((page.guest as Row).qrPass, false);
      assert.equal(((page.features as Row).rsvp as Row).qrPass, false);

      const deluxe = await published();
      const pending = (await (
        await send("GET", guestPath(deluxe.created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((pending.guest as Row).qrPass, false, "no answer yet");
      guestRepository.seedResponse(deluxe.guest.id, { attending: false, partySize: 0 });
      const declined = (await (
        await send("GET", guestPath(deluxe.created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((declined.guest as Row).qrPass, false, "declined");
    });

    it("answers the same invisible 404 for a revoked, unknown, foreign, or malformed token and an invisible slug", async () => {
      const first = await published();
      const second = await published();
      const otherToken = "B".repeat(22);
      guestRepository.seedGuest(second.created.id, { token: otherToken, name: "Otra" });
      await send(
        "POST",
        `${PATH}/${first.created.id}/guests/${first.guest.id}/token`,
        first.cookie,
      );
      const draft = (await (
        await send("POST", PATH, first.cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId: QR_PASS_PACKAGE_ID,
        })
      ).json()) as Row & { id: string; slug: string };

      const probes = [
        guestPath(first.created.slug, "A".repeat(22)),
        guestPath(first.created.slug, otherToken),
        guestPath(first.created.slug, "Z".repeat(22)),
        guestPath(first.created.slug, "not-a-token"),
        guestPath("invitacion-never01", "A".repeat(22)),
        guestPath(String(draft.slug), "A".repeat(22)),
      ];

      for (const path of probes) {
        const response = await send("GET", path);
        assert.equal(response.status, 404, path);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    });

    it("stores the guest's answer and answers the same minimal 202 for a change of mind", async () => {
      const { created, guest } = await published();
      const path = `${guestPath(created.slug, "A".repeat(22))}/rsvp`;

      const response = await send("POST", path, undefined, {
        attending: true,
        partySize: 3,
        message: "  Vamos ",
      });

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(responsesOf(guest.id).length, 1);
      assert.equal(responsesOf(guest.id)[0]?.partySize, 3);
      assert.equal(responsesOf(guest.id)[0]?.message, "Vamos");

      const retry = await send("POST", path, undefined, {
        attending: false,
        partySize: 0,
        message: null,
      });
      assert.equal(retry.status, 202);
      assert.deepEqual(await retry.json(), { status: "received" });
      assert.equal(responsesOf(guest.id).length, 1);
      assert.equal(responsesOf(guest.id)[0]?.attending, false);
    });

    it("answers 400 INVALID_RSVP with the issues and 400 for an unknown field", async () => {
      const { created, guest } = await published();
      const path = `${guestPath(created.slug, "A".repeat(22))}/rsvp`;

      for (const [body, issues] of [
        [
          { attending: true, partySize: 4, message: null },
          ["partySize must be between 1 and 3 when attending"],
        ],
        [
          { attending: false, partySize: 1, message: null },
          ["partySize must be 0 when not attending"],
        ],
        [
          { attending: true, partySize: 1, message: "x".repeat(281) },
          ["message must be at most 280 characters"],
        ],
      ] as const) {
        const response = await send("POST", path, undefined, body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { code: "INVALID_RSVP", issues });
      }
      for (const body of [
        { attending: true, partySize: 1, name: "Otra" },
        { attending: true, partySize: 1, phone: "5512345678" },
        { attending: "yes", partySize: 1 },
        { name: "Ana" },
        "not-json",
      ]) {
        const response = await send("POST", path, undefined, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(
        guestRepository.responses.some((row) => row.guestId === guest.id),
        false,
      );
    });

    it("answers 409 RSVP_NOT_OPEN for an invitation without a guest list and for a passed deadline, and 429 over the cap", async () => {
      const open = await published(RSVP_PACKAGE_ID);
      const openGuest = guestRepository.seedGuest(open.created.id, { token: "C".repeat(22) });
      assert.ok(openGuest);
      const openResponse = await send(
        "POST",
        `${guestPath(open.created.slug, "C".repeat(22))}/rsvp`,
        undefined,
        {
          attending: true,
          partySize: 1,
          message: null,
        },
      );
      assert.equal(openResponse.status, 409);
      assert.deepEqual(await openResponse.json(), { code: "RSVP_NOT_OPEN" });

      const closed = await published();
      await send("PUT", `${PATH}/${closed.created.id}/rsvp-settings`, closed.cookie, {
        deadline: "2020-01-01T00:00:00.000Z",
        partyLimit: 4,
      });
      const closedResponse = await send(
        "POST",
        `${guestPath(closed.created.slug, "A".repeat(22))}/rsvp`,
        undefined,
        { attending: true, partySize: 1, message: null },
      );
      assert.equal(closedResponse.status, 409);
      assert.deepEqual(await closedResponse.json(), { code: "RSVP_NOT_OPEN" });

      const limited = await published();
      rateLimiter.allow = false;
      try {
        const response = await send(
          "POST",
          `${guestPath(limited.created.slug, "A".repeat(22))}/rsvp`,
          undefined,
          { attending: true, partySize: 1, message: null },
        );
        assert.equal(response.status, 429);
        assert.deepEqual(await response.json(), { code: "RSVP_RATE_LIMITED" });
      } finally {
        rateLimiter.allow = true;
      }
      const refusals = [openGuest.id, closed.guest.id, limited.guest.id];
      assert.equal(
        guestRepository.responses.some((row) => refusals.includes(row.guestId)),
        false,
        "no submission was stored",
      );
    });

    it("serves the same answer with a forged cookie, never reading a session", async () => {
      const { created } = await published();

      const response = await send(
        "POST",
        `${guestPath(created.slug, "A".repeat(22))}/rsvp`,
        `${SESSION_COOKIE}=forged.value`,
        { attending: true, partySize: 1, message: null },
      );

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
    });
  });
});
