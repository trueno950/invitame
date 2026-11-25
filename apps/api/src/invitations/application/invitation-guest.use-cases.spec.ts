import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { InvitationNotEditableError } from "../domain/invitation.errors";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type {
  GuestCheckIn,
  GuestFields,
  GuestListReadModel,
  GuestRecord,
  GuestRepository,
  GuestResponseWrite,
  GuestWithResponse,
  NewGuest,
} from "./guest.repository";
import { guestTokenHash } from "./guest-token";
import type {
  InvitationRecord,
  InvitationRecordWithMusic,
  InvitationRepository,
} from "./invitation.repository";
import { GetPublicInvitationUseCase } from "./invitation.use-cases";
import type {
  CatalogPackageEntitlements,
  CatalogTemplateVersionSnapshot,
  CatalogVersionRenderData,
  CatalogVersionSchema,
  InvitationCatalog,
} from "./invitation-catalog";
import {
  GuestListNotAvailableError,
  GuestNotConfirmedError,
  GuestNotFoundError,
  GuestSeatsBelowConfirmedPartyError,
  InvalidGuestError,
  QrPassNotAvailableError,
} from "./invitation-guest.errors";
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
} from "./invitation-guest.use-cases";
import {
  InvalidRsvpResponseError,
  RsvpNotOpenError,
  RsvpRateLimitedError,
} from "./invitation-rsvp.errors";
import type { RsvpReadModel, RsvpRepository, RsvpResponseWrite } from "./rsvp.repository";
import type { RsvpRateLimiter } from "./rsvp-rate-limiter";

// The guest-list use cases (M6 G2; S1, S3, S4) on in-memory ports: what a creator may read and write, what the
// package gate refuses, what a personal link answers, and when a check-in happens. Ownership, the archived
// refusal, the package gates, the deadline, the rate limit, the token rotation, and the idempotent answer and
// check-in are all decided here, so the Prisma adapter and the routes only carry values.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const MALFORMED_ID = "not-a-uuid";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const OWNER = randomUUID();
const RENDERER = "birthday-poster-01";

/** The catalog keys of the three packages these tests use, mirroring the seeded catalog (S3). */
const PACKAGE_KEYS: Readonly<Record<string, readonly string[]>> = {
  deluxe: ["RSVP", "GUEST_LIST", "QR_PASS"],
  "guest-list": ["RSVP", "GUEST_LIST"],
  premium: ["RSVP"],
  basic: ["COUNTDOWN"],
};

/** The invitation port in memory: only the reads the guest use cases need. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecordWithMusic[] = [];
  private sequence = 0;

  create(): Promise<InvitationRecordWithMusic> {
    return Promise.reject(new Error("create is not used by the guest use cases"));
  }

  listOwned(): Promise<InvitationRecordWithMusic[]> {
    return Promise.reject(new Error("listOwned is not used by the guest use cases"));
  }

  updateContent(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("updateContent is not used by the guest use cases"));
  }

  updateFeatures(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("updateFeatures is not used by the guest use cases"));
  }

  archive(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("archive is not used by the guest use cases"));
  }

  publish(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("publish is not used by the guest use cases"));
  }

  unpublish(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("unpublish is not used by the guest use cases"));
  }

  /** The place writes are not part of this suite; the place use cases prove them (see invitation-place.use-cases.spec.ts). */
  async updatePlace(): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async clearPlace(): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    return this.rows.find((row) => row.id === id && row.ownerId === ownerId) ?? null;
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecordWithMusic | null> {
    // An expired invitation keeps resolving: the personal page still renders read-only and only its answers close
    // (S2, T4). The submission rule, not the read, is what refuses it.
    return this.rows.find((row) => row.slug === slug && row.status === "PUBLISHED") ?? null;
  }

  seed(overrides: SeedOptions = {}): InvitationRecordWithMusic {
    const at = new Date("2026-11-01T10:00:00.000Z");
    // The unique slug index is the database's: this double keeps every seeded row distinct so a slug names one row.
    this.sequence += 1;
    const row: InvitationRecordWithMusic = {
      id: randomUUID(),
      ownerId: overrides.ownerId ?? OWNER,
      templateVersionId: randomUUID(),
      packageId: overrides.packageId ?? "guest-list",
      slug: overrides.slug ?? `invitacion-${String(this.sequence).padStart(4, "0")}`,
      status: overrides.status ?? "PUBLISHED",
      content: {},
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      rsvpDeadline: overrides.rsvpDeadline ?? null,
      rsvpPartyLimit: overrides.rsvpPartyLimit ?? 4,
      places: {},
      archivedAt: overrides.status === "ARCHIVED" ? at : null,
      publishedAt: overrides.status === "PUBLISHED" ? at : null,
      firstPublishedAt: overrides.status === "PUBLISHED" ? at : null,
      expiresAt: overrides.expiresAt ?? null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return row;
  }
}

interface SeedOptions {
  ownerId?: string;
  packageId?: string;
  slug?: string;
  status?: InvitationStatus;
  rsvpDeadline?: Date | null;
  rsvpPartyLimit?: number;
  /** The expiry the publication wrote (S1, S2); null for a row that never expires. */
  expiresAt?: Date | null;
}

/**
 * The guest port in memory. Like the Prisma adapter it repeats the guards the use cases state — the owner scope,
 * the editable statuses, the attending answer for a check-in — so a use case that skipped one would be caught here.
 * The plain token never enters this class: it holds the digests, exactly as `Guest.tokenHash` does.
 */
class MemoryGuestRepository implements GuestRepository {
  readonly guests: Array<GuestRecord & { tokenHash: string; slug: string }> = [];
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

  private answerOf(guestId: string) {
    return this.responses.find((row) => row.guestId === guestId) ?? null;
  }

  private withResponse(
    guest: GuestRecord & { tokenHash: string; slug: string },
  ): GuestWithResponse {
    const answer = this.answerOf(guest.id);
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
    const invitation = this.editable(ownerId, invitationId);
    if (invitation === null) {
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
      slug: invitation.slug,
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
    const invitation = this.editable(ownerId, invitationId);
    if (invitation === null) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    if (guest === undefined) {
      return null;
    }
    const answer = this.answerOf(guestId);
    if (answer?.attending === true && answer.partySize > fields.seats) {
      throw new GuestSeatsBelowConfirmedPartyError(answer.partySize);
    }
    Object.assign(guest, fields, { updatedAt: at });
    return this.withResponse(guest);
  }

  async remove(ownerId: string, invitationId: string, guestId: string): Promise<boolean> {
    const invitation = this.editable(ownerId, invitationId);
    if (invitation === null) {
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
    const invitation = this.editable(ownerId, invitationId);
    if (invitation === null) {
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
      (invitation.rsvpDeadline !== null && at.getTime() > invitation.rsvpDeadline.getTime()) ||
      // The expiry is re-stated in the write, like the adapter's own statement (S2, T4).
      (invitation.expiresAt !== null && at.getTime() > invitation.expiresAt.getTime())
    ) {
      return false;
    }
    const existing = this.answerOf(guestId);
    if (existing !== null) {
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
    const answer = this.answerOf(guest.id);
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

  /** The digest stored for one guest of a test; a test asserts what the adapter was asked to store. */
  tokenHashOf(guestId: string): string | undefined {
    return this.guests.find((row) => row.id === guestId)?.tokenHash;
  }
}

/** The catalog contract in memory: the pinned version renders, and each package grants the keys above. */
class MemoryCatalog implements InvitationCatalog {
  findPublishedVersion(): Promise<CatalogTemplateVersionSnapshot | null> {
    return Promise.resolve(null);
  }

  findVersionSchema(): Promise<CatalogVersionSchema | null> {
    return Promise.resolve(null);
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    const includedFeatureKeys = PACKAGE_KEYS[packageId];
    return includedFeatureKeys === undefined
      ? null
      : { status: "ACTIVE", includedFeatureKeys, durationDays: 30 };
  }

  findVersionRenderData(): Promise<CatalogVersionRenderData | null> {
    return Promise.resolve({
      componentKey: RENDERER,
      configuration: { componentKey: RENDERER },
      schema: { type: "object", required: [], properties: { title: { type: "string" } } },
    });
  }

  isRendererRegistered(componentKey: string): boolean {
    return componentKey === RENDERER;
  }
}

/** The rate limiter in memory: records the subject it counted and answers whatever a test chose (S4). */
class MemoryRateLimiter implements RsvpRateLimiter {
  allow = true;
  readonly consumed: Array<{ invitationId: string; subject: string }> = [];

  async consume(invitationId: string, subject: string): Promise<boolean> {
    this.consumed.push({ invitationId, subject });
    return this.allow;
  }
}

/** The RSVP port in memory: only the creator read the export needs in guest-list mode. */
class MemoryRsvpRepository implements RsvpRepository {
  readonly responses: RsvpResponseWrite[] = [];

  saveSettings(): Promise<never> {
    return Promise.reject(new Error("saveSettings is not used by the guest use cases"));
  }

  findResponses(): Promise<RsvpReadModel | null> {
    return Promise.resolve(null);
  }

  upsertResponse(): Promise<boolean> {
    return Promise.reject(new Error("upsertResponse is not used by the guest use cases"));
  }
}

describe("guest list use cases (M6 G2; S1, S3, S4)", () => {
  const invitations = new MemoryInvitationRepository();
  const guests = new MemoryGuestRepository(invitations);
  const catalog = new MemoryCatalog();
  const rateLimiter = new MemoryRateLimiter();
  const rsvp = new MemoryRsvpRepository();
  const publicInvitations = new GetPublicInvitationUseCase(invitations, catalog);

  const list = new ListGuestsUseCase(invitations, catalog, guests);
  const create = new CreateGuestUseCase(invitations, catalog, guests, () => NOW);
  const update = new UpdateGuestUseCase(invitations, catalog, guests, () => NOW);
  const remove = new DeleteGuestUseCase(invitations, catalog, guests);
  const rotate = new RotateGuestTokenUseCase(invitations, catalog, guests, () => NOW);
  const readGuest = new GetPublicGuestUseCase(invitations, guests, publicInvitations);
  const submit = new SubmitGuestRsvpUseCase(invitations, catalog, guests, rateLimiter, () => NOW);
  const checkIn = new CheckInGuestUseCase(invitations, catalog, guests, () => NOW);
  const exportAttendance = new GetAttendanceExportUseCase(invitations, catalog, guests, rsvp);

  /**
   * An invitation of the given package with one guest whose plain token this test keeps. A caller that passes an
   * existing invitation adds another guest to it, which is how a list of more than one guest is built.
   */
  async function seedGuest(
    overrides: SeedOptions & { seats?: number; name?: string; invitation?: InvitationRecord } = {},
  ): Promise<{ invitation: InvitationRecord; guest: GuestRecord; token: string }> {
    const invitation = overrides.invitation ?? invitations.seed(overrides);
    const created = await create.execute({
      ownerId: invitation.ownerId,
      id: invitation.id,
      name: overrides.name ?? "  Ana   Pérez ",
      seats: overrides.seats ?? 3,
      phone: "55 1234 5678",
      note: " Mesa 4 ",
    });
    assert.ok(created !== null, "the guest is created");
    return { invitation, guest: created.guest, token: created.token };
  }

  describe("the creator's guest list", () => {
    it("adds a guest, answers the plain token once, and stores only its digest", async () => {
      const invitation = invitations.seed();
      const created = await create.execute({
        ownerId: invitation.ownerId,
        id: invitation.id,
        name: "  Ana   Pérez ",
        seats: 3,
        phone: "55 1234 5678",
        note: " Mesa 4 ",
      });

      assert.ok(created !== null);
      assert.equal(created.token.length, 22);
      assert.equal(created.guest.name, "Ana Pérez");
      assert.equal(created.guest.seats, 3);
      assert.equal(created.guest.phone, "+525512345678");
      assert.equal(created.guest.note, "Mesa 4");
      assert.equal(created.guest.tokenIssuedAt.toISOString(), NOW.toISOString());
      assert.equal(created.guest.checkedInAt, null);
      // The plain token is never stored; the digest is what the unique index reads.
      assert.equal(guests.tokenHashOf(created.guest.id), guestTokenHash(created.token));
      assert.equal(JSON.stringify(created.guest).includes(created.token), false);
      assert.equal(JSON.stringify(created.guest).includes("tokenHash"), false);
    });

    it("reads the guests with their answers and the totals of the page", async () => {
      const first = await seedGuest({ seats: 3, name: "Ana" });
      const second = await seedGuest({ invitation: first.invitation, seats: 2, name: "Beto" });
      await submit.execute({
        slug: first.invitation.slug,
        token: first.token,
        attending: true,
        partySize: 3,
        message: "Vamos",
      });
      await submit.execute({
        slug: second.invitation.slug,
        token: second.token,
        attending: false,
        partySize: 0,
        message: null,
      });

      const read = await list.execute(first.invitation.ownerId, first.invitation.id);

      assert.equal(read?.slug, first.invitation.slug);
      assert.deepEqual(read?.totals, {
        guests: 2,
        seats: 5,
        attendingGuests: 1,
        attendingPeople: 3,
        declinedCount: 1,
        pendingCount: 0,
        checkedInCount: 0,
      });
      assert.deepEqual(
        read?.guests.map((guest) => [guest.name, guest.response?.attending]),
        [
          ["Beto", false],
          ["Ana", true],
        ],
      );
      // Nothing internal travels: the digest is the adapter's, and the plain token was never ours to read.
      const text = JSON.stringify(read);
      for (const internal of ["tokenHash", first.token]) {
        assert.equal(text.includes(internal), false, internal);
      }
    });

    it("answers null for another owner's invitation, an unknown id, and a malformed id", async () => {
      const { invitation, guest } = await seedGuest();
      const stranger = randomUUID();

      assert.equal(await list.execute(stranger, invitation.id), null);
      assert.equal(await list.execute(invitation.ownerId, UNKNOWN_ID), null);
      assert.equal(await list.execute(invitation.ownerId, MALFORMED_ID), null);
      assert.equal(
        await update.execute({
          ownerId: stranger,
          id: invitation.id,
          guestId: guest.id,
          name: "Otra",
          seats: 2,
          phone: null,
          note: null,
        }),
        null,
      );
      assert.equal(await remove.execute(stranger, invitation.id, guest.id), false);
      assert.equal(await rotate.execute(stranger, invitation.id, guest.id), null);
      assert.equal(await readGuest.execute(invitation.slug, "A".repeat(22)), null);
    });

    it("refuses every guest route with 409 when the package does not grant GUEST_LIST", async () => {
      const { invitation } = await seedGuest();
      const premium = invitations.seed({ packageId: "premium", slug: "invitacion-premium1" });

      for (const refusal of [
        () => list.execute(premium.ownerId, premium.id),
        () =>
          create.execute({
            ownerId: premium.ownerId,
            id: premium.id,
            name: "Ana",
            seats: 1,
            phone: null,
            note: null,
          }),
        () =>
          update.execute({
            ownerId: invitation.ownerId,
            id: premium.id,
            guestId: randomUUID(),
            name: "Ana",
            seats: 1,
            phone: null,
            note: null,
          }),
        () => remove.execute(premium.ownerId, premium.id, randomUUID()),
        () => rotate.execute(premium.ownerId, premium.id, randomUUID()),
      ]) {
        await assert.rejects(refusal, GuestListNotAvailableError);
      }
      assert.equal(
        await guests.findGuests(premium.ownerId, premium.id).then((read) => read?.guests.length),
        0,
      );
    });

    it("edits a guest, keeping the token and the check-in state", async () => {
      const { invitation, guest, token } = await seedGuest({ seats: 3 });
      const hash = guests.tokenHashOf(guest.id);

      const updated = await update.execute({
        ownerId: invitation.ownerId,
        id: invitation.id,
        guestId: guest.id,
        name: "Ana María",
        seats: 5,
        phone: "+5215512345678",
        note: null,
      });

      assert.equal(updated?.name, "Ana María");
      assert.equal(updated?.seats, 5);
      assert.equal(updated?.phone, "+5215512345678");
      assert.equal(updated?.note, null);
      assert.equal(guests.tokenHashOf(guest.id), hash);
      // The old link still works: an edit is not a rotation.
      assert.equal((await readGuest.execute(invitation.slug, token))?.guest.name, "Ana María");
    });

    it("refuses an edit that would leave fewer seats than the party the guest confirmed", async () => {
      const { invitation, guest, token } = await seedGuest({ seats: 3 });
      await submit.execute({
        slug: invitation.slug,
        token,
        attending: true,
        partySize: 3,
        message: null,
      });

      await assert.rejects(
        update.execute({
          ownerId: invitation.ownerId,
          id: invitation.id,
          guestId: guest.id,
          name: "Ana",
          seats: 2,
          phone: null,
          note: null,
        }),
        (error: unknown) =>
          error instanceof GuestSeatsBelowConfirmedPartyError && error.partySize === 3,
      );
      assert.equal(guests.guests.find((row) => row.id === guest.id)?.seats, 3);
      // A decline names no people, so the same seat count is fine.
      await submit.execute({
        slug: invitation.slug,
        token,
        attending: false,
        partySize: 0,
        message: null,
      });
      assert.equal(
        (
          await update.execute({
            ownerId: invitation.ownerId,
            id: invitation.id,
            guestId: guest.id,
            name: "Ana",
            seats: 2,
            phone: null,
            note: null,
          })
        )?.seats,
        2,
      );
    });

    it("refuses a guest the domain cannot accept and stores nothing", async () => {
      const invitation = invitations.seed();

      for (const [input, issues] of [
        [
          { name: "", seats: 1, phone: null, note: null },
          ["name must be between 1 and 80 characters"],
        ],
        [{ name: "Ana", seats: 0, phone: null, note: null }, ["seats must be between 1 and 10"]],
        [{ name: "Ana", seats: 1, phone: "12345", note: null }, [expectPhoneIssue()]],
        [
          { name: "Ana", seats: 1, phone: null, note: "n".repeat(201) },
          ["note must be at most 200 characters"],
        ],
      ] as const) {
        await assert.rejects(
          create.execute({ ownerId: invitation.ownerId, id: invitation.id, ...input }),
          (error: unknown) =>
            error instanceof InvalidGuestError && error.issues.join("|") === issues.join("|"),
        );
      }
      assert.deepEqual(
        await guests.findGuests(invitation.ownerId, invitation.id).then((read) => read?.guests),
        [],
      );
    });

    it("removes a guest together with the answer they already gave", async () => {
      const { invitation, guest, token } = await seedGuest();
      await submit.execute({
        slug: invitation.slug,
        token,
        attending: true,
        partySize: 2,
        message: null,
      });
      assert.equal(guests.responses.filter((row) => row.guestId === guest.id).length, 1);

      assert.equal(await remove.execute(invitation.ownerId, invitation.id, guest.id), true);

      assert.equal((await guests.findGuests(invitation.ownerId, invitation.id))?.guests.length, 0);
      // The answer went with the guest: nothing is left for a guest the owner no longer lists.
      assert.equal(guests.responses.filter((row) => row.guestId === guest.id).length, 0);
      // The personal link is gone too, and the removal is not repeatable.
      assert.equal(await readGuest.execute(invitation.slug, token), null);
      await assert.rejects(
        remove.execute(invitation.ownerId, invitation.id, guest.id),
        GuestNotFoundError,
      );
    });

    it("rotates the token: the new link works, the old one stops working, and the answer is kept", async () => {
      const { invitation, guest, token } = await seedGuest({ seats: 2 });
      await submit.execute({
        slug: invitation.slug,
        token,
        attending: true,
        partySize: 2,
        message: null,
      });
      const previousHash = guests.tokenHashOf(guest.id);

      const rotated = await rotate.execute(invitation.ownerId, invitation.id, guest.id);

      assert.ok(rotated !== null);
      assert.notEqual(rotated.token, token);
      assert.equal(guests.tokenHashOf(guest.id), guestTokenHash(rotated.token));
      assert.notEqual(guests.tokenHashOf(guest.id), previousHash);
      assert.equal(rotated.guest.tokenIssuedAt.toISOString(), NOW.toISOString());
      assert.equal(await readGuest.execute(invitation.slug, token), null);
      assert.equal((await readGuest.execute(invitation.slug, rotated.token))?.guest.seats, 2);
      assert.equal(
        (await readGuest.execute(invitation.slug, rotated.token))?.guest.response?.partySize,
        2,
      );
    });

    it("keeps the guest list of an archived invitation readable and refuses its writes", async () => {
      const { invitation, guest } = await seedGuest();
      invitation.status = "ARCHIVED";
      invitation.archivedAt = NOW;

      // Archiving is read-only, not erased (A2).
      assert.equal((await list.execute(invitation.ownerId, invitation.id))?.guests.length, 1);
      for (const write of [
        () =>
          create.execute({
            ownerId: invitation.ownerId,
            id: invitation.id,
            name: "Beto",
            seats: 1,
            phone: null,
            note: null,
          }),
        () =>
          update.execute({
            ownerId: invitation.ownerId,
            id: invitation.id,
            guestId: guest.id,
            name: "Beto",
            seats: 1,
            phone: null,
            note: null,
          }),
        () => remove.execute(invitation.ownerId, invitation.id, guest.id),
        () => rotate.execute(invitation.ownerId, invitation.id, guest.id),
        () =>
          checkIn.execute({
            ownerId: invitation.ownerId,
            id: invitation.id,
            token: "A".repeat(22),
          }),
      ]) {
        await assert.rejects(write, InvitationNotEditableError);
      }
      assert.equal((await list.execute(invitation.ownerId, invitation.id))?.guests.length, 1);
    });
  });

  describe("the personal page and the guest's answer", () => {
    it("answers the public page plus the guest's own block, and nothing about another guest", async () => {
      const first = await seedGuest({ packageId: "deluxe", seats: 3, name: "Ana" });
      await seedGuest({ invitation: first.invitation, seats: 2, name: "Beto" });
      await submit.execute({
        slug: first.invitation.slug,
        token: first.token,
        attending: true,
        partySize: 2,
        message: "  Vamos ",
      });

      const page = await readGuest.execute(first.invitation.slug, first.token);

      assert.equal(page?.page.slug, first.invitation.slug);
      // The internal id lets the route count this opening as a GUEST one (M9 T11; S7); no response carries it.
      assert.equal(page?.page.invitationId, first.invitation.id);
      assert.equal(page?.page.features.rsvp.mode, "guest-list");
      assert.equal(page?.guest.name, "Ana");
      assert.equal(page?.guest.seats, 3);
      assert.deepEqual(page?.guest.response, {
        attending: true,
        partySize: 2,
        message: "Vamos",
      });
      // Deluxe grants the QR pass, and this guest confirmed: the page offers it.
      assert.equal(page?.guest.qrPass, true);
      const text = JSON.stringify(page);
      for (const secret of ["Beto", first.token, first.invitation.ownerId]) {
        assert.equal(text.includes(secret), false, secret);
      }
    });

    it("offers the QR pass only to a confirmed guest of a package that grants it", async () => {
      const noQr = await seedGuest({ packageId: "guest-list", slug: "invitacion-noqr01" });
      assert.equal(
        (await readGuest.execute(noQr.invitation.slug, noQr.token))?.guest.qrPass,
        false,
      );

      const deluxe = await seedGuest({ packageId: "deluxe", slug: "invitacion-qr0001" });
      assert.equal(
        (await readGuest.execute(deluxe.invitation.slug, deluxe.token))?.guest.qrPass,
        false,
      );
      await submit.execute({
        slug: deluxe.invitation.slug,
        token: deluxe.token,
        attending: false,
        partySize: 0,
        message: null,
      });
      assert.equal(
        (await readGuest.execute(deluxe.invitation.slug, deluxe.token))?.guest.qrPass,
        false,
      );
      await submit.execute({
        slug: deluxe.invitation.slug,
        token: deluxe.token,
        attending: true,
        partySize: 1,
        message: null,
      });
      assert.equal(
        (await readGuest.execute(deluxe.invitation.slug, deluxe.token))?.guest.qrPass,
        true,
      );
    });

    it("answers the same invisible 404 for a revoked token, a token of another invitation, and an unknown slug", async () => {
      const first = await seedGuest({ slug: "invitacion-first1" });
      const second = await seedGuest({ slug: "invitacion-second" });

      // A token of another invitation names no guest of this one: the lookup is scoped by the invitation.
      assert.equal(await readGuest.execute(first.invitation.slug, second.token), null);
      // A malformed token cannot have been minted, so it never reaches a query.
      assert.equal(await readGuest.execute(first.invitation.slug, "not-a-token"), null);
      assert.equal(await readGuest.execute(first.invitation.slug, `${"A".repeat(21)}=`), null);
      // A rotated token stops resolving the old link.
      const rotated = await rotate.execute(
        first.invitation.ownerId,
        first.invitation.id,
        first.guest.id,
      );
      assert.ok(rotated !== null);
      assert.equal(await readGuest.execute(first.invitation.slug, first.token), null);
      // An unknown or unpublished slug answers like an unknown token.
      assert.equal(await readGuest.execute("invitacion-never0", first.token), null);
      first.invitation.status = "DRAFT";
      assert.equal(await readGuest.execute(first.invitation.slug, rotated.token), null);
    });

    it("stores the guest's answer, updates a change of mind, and keeps the first answer instant", async () => {
      const { invitation, guest, token } = await seedGuest({ seats: 4 });

      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token,
          attending: true,
          partySize: 3,
          message: "  Vamos ",
        }),
        true,
      );
      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token,
          attending: true,
          partySize: 4,
          message: null,
        }),
        true,
      );

      const answers = guests.responses.filter((row) => row.guestId === guest.id);
      assert.equal(answers.length, 1);
      assert.equal(answers[0]?.partySize, 4);
      assert.equal(answers[0]?.message, null);
      assert.equal(answers[0]?.createdAt.toISOString(), NOW.toISOString());
    });

    it("refuses a party above the guest's seats and a declined answer that names people", async () => {
      const { invitation, guest, token } = await seedGuest({ seats: 2 });

      for (const [body, issues] of [
        [
          { attending: true, partySize: 3, message: null },
          ["partySize must be between 1 and 2 when attending"],
        ],
        [
          { attending: false, partySize: 2, message: null },
          ["partySize must be 0 when not attending"],
        ],
        [
          { attending: true, partySize: 1, message: "x".repeat(281) },
          ["message must be at most 280 characters"],
        ],
      ] as const) {
        await assert.rejects(
          submit.execute({ slug: invitation.slug, token, ...body }),
          (error: unknown) =>
            error instanceof InvalidRsvpResponseError &&
            error.issues.join("|") === issues.join("|"),
        );
      }
      assert.equal(guests.responses.filter((row) => row.guestId === guest.id).length, 0);
    });

    it("refuses an invitation that does not take personal answers, and a passed deadline", async () => {
      // The guest list existed while the package granted it; the gate reads the package as it is now.
      const premium = await seedGuest({ slug: "invitacion-premium1" });
      premium.invitation.packageId = "premium";
      await assert.rejects(
        submit.execute({
          slug: premium.invitation.slug,
          token: premium.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        RsvpNotOpenError,
      );

      const closed = await seedGuest({
        slug: "invitacion-closed1",
        rsvpDeadline: new Date("2026-11-19T00:00:00.000Z"),
      });
      await assert.rejects(
        submit.execute({
          slug: closed.invitation.slug,
          token: closed.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        RsvpNotOpenError,
      );
      assert.equal(guests.responses.filter((row) => row.guestId === closed.guest.id).length, 0);
    });

    it("closes a personal link's RSVP when the invitation expired, and still renders its page (S2, T4)", async () => {
      const { guest, invitation, token } = await seedGuest({
        slug: "invitacion-expird1",
        expiresAt: new Date("2026-11-20T00:00:00.000Z"),
      });
      rateLimiter.consumed.length = 0;

      await assert.rejects(
        submit.execute({
          slug: invitation.slug,
          token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        RsvpNotOpenError,
      );
      assert.equal(guests.responses.filter((row) => row.guestId === guest.id).length, 0);
      // A refused answer never spends the guest's budget.
      assert.deepEqual(rateLimiter.consumed, []);

      // The personal page is still answered: the invitation stays visible read-only (S2).
      const page = await readGuest.execute(invitation.slug, token);
      assert.equal(page?.page.expired, true);
      assert.equal(page?.guest.name, "Ana Pérez");
    });

    it("accepts an answer at the expiry instant and refuses it one millisecond later (S2, T4)", async () => {
      const open = await seedGuest({
        slug: "invitacion-open0001",
        expiresAt: new Date("2026-11-20T12:00:00.000Z"),
      });
      assert.equal(
        await submit.execute({
          slug: open.invitation.slug,
          token: open.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        true,
      );

      const expired = await seedGuest({
        slug: "invitacion-gone0001",
        expiresAt: new Date("2026-11-20T12:00:00.000Z"),
      });
      expired.invitation.expiresAt = new Date("2026-11-20T11:59:59.999Z");
      await assert.rejects(
        submit.execute({
          slug: expired.invitation.slug,
          token: expired.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        RsvpNotOpenError,
      );
      assert.equal(guests.responses.filter((row) => row.guestId === expired.guest.id).length, 0);
    });

    it("counts every submission against the guest, never against another guest's budget", async () => {
      const first = await seedGuest({ slug: "invitacion-budget1" });
      const second = await seedGuest({ slug: "invitacion-budget2" });
      rateLimiter.consumed.length = 0;

      await submit.execute({
        slug: first.invitation.slug,
        token: first.token,
        attending: true,
        partySize: 1,
        message: null,
      });
      await submit.execute({
        slug: second.invitation.slug,
        token: second.token,
        attending: true,
        partySize: 1,
        message: null,
      });

      assert.deepEqual(rateLimiter.consumed, [
        { invitationId: first.invitation.id, subject: first.guest.id },
        { invitationId: second.invitation.id, subject: second.guest.id },
      ]);
      // The client address plays no part here: the guest's own link is the budget (S4).
      rateLimiter.allow = false;
      try {
        await assert.rejects(
          submit.execute({
            slug: first.invitation.slug,
            token: first.token,
            attending: true,
            partySize: 1,
            message: null,
          }),
          RsvpRateLimitedError,
        );
      } finally {
        rateLimiter.allow = true;
      }
    });

    it("answers the invisible 404 for a revoked or unknown token without counting a submission", async () => {
      const { invitation, token } = await seedGuest();
      rateLimiter.consumed.length = 0;

      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: `${"B".repeat(22)}`,
          attending: true,
          partySize: 1,
          message: null,
        }),
        false,
      );
      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: "not-a-token",
          attending: true,
          partySize: 1,
          message: null,
        }),
        false,
      );
      assert.deepEqual(rateLimiter.consumed, []);
      // The real token still answers.
      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        true,
      );
    });
  });

  describe("the owner's check-in", () => {
    async function confirmedGuest(overrides: SeedOptions & { seats?: number } = {}) {
      const seeded = await seedGuest({ packageId: "deluxe", ...overrides });
      await submit.execute({
        slug: seeded.invitation.slug,
        token: seeded.token,
        attending: true,
        partySize: 2,
        message: null,
      });
      return seeded;
    }

    it("checks a confirmed guest in, keeps the first instant, and answers the party", async () => {
      const { invitation, guest, token } = await confirmedGuest({ seats: 3 });

      const first = await checkIn.execute({
        ownerId: invitation.ownerId,
        id: invitation.id,
        token,
      });

      assert.deepEqual(first, {
        id: guest.id,
        name: guest.name,
        seats: 3,
        partySize: 2,
        checkedInAt: NOW,
      });

      const later = await checkIn.execute({
        ownerId: invitation.ownerId,
        id: invitation.id,
        token,
      });
      assert.equal(later?.checkedInAt.toISOString(), NOW.toISOString());
      assert.equal(
        guests.guests.find((row) => row.id === guest.id)?.checkedInAt?.toISOString(),
        NOW.toISOString(),
      );
    });

    it("refuses a guest who has not confirmed, an unknown token, and another owner's invitation", async () => {
      const pending = await seedGuest({ packageId: "deluxe" });
      await assert.rejects(
        checkIn.execute({
          ownerId: pending.invitation.ownerId,
          id: pending.invitation.id,
          token: pending.token,
        }),
        GuestNotConfirmedError,
      );

      const confirmed = await confirmedGuest({ slug: "invitacion-confirm1" });
      await assert.rejects(
        checkIn.execute({
          ownerId: confirmed.invitation.ownerId,
          id: confirmed.invitation.id,
          token: `${"C".repeat(22)}`,
        }),
        GuestNotFoundError,
      );
      assert.equal(
        await checkIn.execute({
          ownerId: randomUUID(),
          id: confirmed.invitation.id,
          token: confirmed.token,
        }),
        null,
      );
      assert.equal(
        await checkIn.execute({
          ownerId: confirmed.invitation.ownerId,
          id: UNKNOWN_ID,
          token: confirmed.token,
        }),
        null,
      );
      // A token of another invitation of the same owner names no guest of this one.
      const sibling = await confirmedGuest({ slug: "invitacion-sibling1" });
      await assert.rejects(
        checkIn.execute({
          ownerId: confirmed.invitation.ownerId,
          id: confirmed.invitation.id,
          token: sibling.token,
        }),
        GuestNotFoundError,
      );
      // Nothing was checked in by any of the refusals.
      for (const row of guests.guests.filter(
        (candidate) => candidate.invitationId === confirmed.invitation.id,
      )) {
        assert.equal(row.checkedInAt, null, row.name);
      }
    });

    it("refuses the check-in when the package does not grant QR_PASS", async () => {
      const { invitation, token } = await confirmedGuest({
        packageId: "guest-list",
        slug: "invitacion-noqr0002",
      });

      await assert.rejects(
        checkIn.execute({ ownerId: invitation.ownerId, id: invitation.id, token }),
        QrPassNotAvailableError,
      );
      assert.equal(
        guests.guests.find((row) => row.invitationId === invitation.id)?.checkedInAt,
        null,
      );
    });
  });

  describe("the creator's export", () => {
    it("exports the guest list in guest-list mode, pending guests included", async () => {
      const first = await seedGuest({ seats: 3, name: "Ana", slug: "invitacion-export1" });
      await submit.execute({
        slug: first.invitation.slug,
        token: first.token,
        attending: true,
        partySize: 2,
        message: null,
      });
      await seedGuest({ invitation: first.invitation, seats: 1, name: "Beto" });

      const exported = await exportAttendance.execute(
        first.invitation.ownerId,
        first.invitation.id,
      );

      assert.equal(exported?.filename, `asistencia-${first.invitation.slug}.csv`);
      const lines = exported?.body.split("\r\n") ?? [];
      assert.equal(lines[0]?.startsWith("Nombre,Lugares,"), true);
      assert.equal(lines[1]?.startsWith("Beto,1,Pendiente,"), true);
      assert.equal(lines[2]?.startsWith("Ana,3,Sí,2,"), true);
    });

    it("keeps the open form's response export, and answers 404 for a foreign invitation", async () => {
      const premium = invitations.seed({ packageId: "premium", slug: "invitacion-open0001" });
      // The open-form read is a different port; this test observes that guest-list mode is not selected.
      const exported = await exportAttendance.execute(premium.ownerId, premium.id);

      assert.equal(exported, null);
      assert.equal(await exportAttendance.execute(randomUUID(), premium.id), null);
      assert.equal(await exportAttendance.execute(premium.ownerId, MALFORMED_ID), null);
    });
  });
});

/** The phone issue the domain states, repeated here so the expected list reads as the client sees it. */
function expectPhoneIssue(): string {
  return "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";
}
