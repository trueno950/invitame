import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { InvitationNotEditableError } from "../domain/invitation.errors";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { RsvpSettings } from "../domain/invitation-rsvp";
import type { InvitationRecordWithMusic, InvitationRepository } from "./invitation.repository";
import type {
  CatalogPackageEntitlements,
  CatalogTemplateVersionSnapshot,
  CatalogVersionRenderData,
  CatalogVersionSchema,
  InvitationCatalog,
} from "./invitation-catalog";
import {
  InvalidRsvpResponseError,
  InvalidRsvpSettingsError,
  RsvpNotOpenError,
  RsvpRateLimitedError,
} from "./invitation-rsvp.errors";
import {
  GetRsvpResponsesUseCase,
  SubmitPublicRsvpUseCase,
  UpdateRsvpSettingsUseCase,
} from "./invitation-rsvp.use-cases";
import type {
  RsvpReadModel,
  RsvpRepository,
  RsvpResponseRecord,
  RsvpResponseWrite,
} from "./rsvp.repository";
import type { RsvpRateLimiter } from "./rsvp-rate-limiter";

// The RSVP use cases (M6 G1; S1, S3, S4) on in-memory ports: what a creator may save, what a creator may read,
// and when a guest's submission is stored. The ownership scope, the archived refusal, the package gate, the
// deadline, the rate limit, the honeypot, and the dedupe upsert are all decided here, so the Prisma adapter and the
// routes only carry values.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const MALFORMED_ID = "not-a-uuid";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const OWNER = randomUUID();
const SLUG = "invitacion-k7m2qx";

/** The invitation port in memory: only the reads the RSVP use cases need. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecordWithMusic[] = [];

  /** The rest of the port belongs to the invitation routes; an unexpected call is a test mistake. */
  create(): Promise<InvitationRecordWithMusic> {
    return Promise.reject(new Error("create is not used by the RSVP use cases"));
  }

  listOwned(): Promise<InvitationRecordWithMusic[]> {
    return Promise.reject(new Error("listOwned is not used by the RSVP use cases"));
  }

  updateContent(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("updateContent is not used by the RSVP use cases"));
  }

  updateFeatures(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("updateFeatures is not used by the RSVP use cases"));
  }

  archive(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("archive is not used by the RSVP use cases"));
  }

  publish(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("publish is not used by the RSVP use cases"));
  }

  unpublish(): Promise<InvitationRecordWithMusic | null> {
    return Promise.reject(new Error("unpublish is not used by the RSVP use cases"));
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    return this.rows.find((row) => row.id === id && row.ownerId === ownerId) ?? null;
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecordWithMusic | null> {
    const now = Date.now();
    return (
      this.rows.find(
        (row) =>
          row.slug === slug &&
          row.status === "PUBLISHED" &&
          (row.expiresAt === null || row.expiresAt.getTime() > now),
      ) ?? null
    );
  }

  seed(overrides: SeedOptions = {}): InvitationRecordWithMusic {
    const at = new Date("2026-11-01T10:00:00.000Z");
    const row: InvitationRecordWithMusic = {
      id: randomUUID(),
      ownerId: overrides.ownerId ?? OWNER,
      templateVersionId: randomUUID(),
      packageId: overrides.packageId ?? "package",
      slug: overrides.slug ?? SLUG,
      status: overrides.status ?? "PUBLISHED",
      content: {},
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      rsvpDeadline: overrides.rsvpDeadline ?? null,
      rsvpPartyLimit: overrides.rsvpPartyLimit ?? 4,
      archivedAt: overrides.status === "ARCHIVED" ? at : null,
      publishedAt: overrides.status === "PUBLISHED" ? at : null,
      expiresAt: overrides.expiresAt ?? null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return row;
  }
}

interface SeedOptions {
  ownerId?: string | undefined;
  packageId?: string | undefined;
  slug?: string | undefined;
  status?: InvitationStatus | undefined;
  rsvpDeadline?: Date | null | undefined;
  rsvpPartyLimit?: number | undefined;
  expiresAt?: Date | null | undefined;
}

/**
 * The RSVP port in memory. `saveSettings` and `upsertResponse` repeat the adapter's own guards — ownership, an
 * editable status, and a still-published invitation — so a use case that skipped them would be caught here.
 */
class MemoryRsvpRepository implements RsvpRepository {
  readonly responses: RsvpResponseRecord[] = [];
  readonly settings = new Map<string, RsvpSettings>();
  /** When set, the next write answers exactly this, so a concurrent change can be observed. */
  refuseWrites = false;
  private sequence = 0;

  constructor(private readonly invitations: MemoryInvitationRepository) {}

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
    if (this.refuseWrites) {
      invitation.status = "ARCHIVED";
      throw new InvitationNotEditableError("ARCHIVED");
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
      settings: {
        deadline: invitation.rsvpDeadline,
        partyLimit: invitation.rsvpPartyLimit,
      },
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

  /** A row inserted directly, for the reads under test. */
  seedResponse(
    invitationId: string,
    overrides: Partial<RsvpResponseWrite> & { createdAt?: Date; updatedAt?: Date } = {},
  ): RsvpResponseRecord {
    const at = overrides.createdAt ?? new Date("2026-11-19T10:00:00.000Z");
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

/** The catalog contract in memory: the included feature keys of each package. */
class MemoryInvitationCatalog implements InvitationCatalog {
  constructor(readonly packages: ReadonlyMap<string, readonly string[]>) {}

  findPublishedVersion(): Promise<CatalogTemplateVersionSnapshot | null> {
    return Promise.resolve(null);
  }

  findVersionSchema(): Promise<CatalogVersionSchema | null> {
    return Promise.resolve(null);
  }

  findVersionRenderData(): Promise<CatalogVersionRenderData | null> {
    return Promise.resolve(null);
  }

  isRendererRegistered(): boolean {
    return true;
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    const includedFeatureKeys = this.packages.get(packageId);
    return includedFeatureKeys === undefined
      ? null
      : { status: "ACTIVE", includedFeatureKeys: [...includedFeatureKeys] };
  }
}

/** The rate limiter in memory: records every counted submission and answers whatever a test chose. */
class MemoryRateLimiter implements RsvpRateLimiter {
  allow = true;
  readonly consumed: Array<{ invitationId: string; clientAddress: string }> = [];

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    this.consumed.push({ invitationId, clientAddress });
    return this.allow;
  }
}

function seeded(
  options: {
    packageKeys?: readonly string[] | undefined;
    status?: InvitationStatus | undefined;
    rsvpDeadline?: Date | null | undefined;
    rsvpPartyLimit?: number | undefined;
    ownerId?: string | undefined;
    slug?: string | undefined;
    expiresAt?: Date | null | undefined;
  } = {},
) {
  const invitations = new MemoryInvitationRepository();
  const rsvp = new MemoryRsvpRepository(invitations);
  const catalog = new MemoryInvitationCatalog(
    new Map([["rsvp-package", options.packageKeys ?? ["COUNTDOWN", "RSVP"]]]),
  );
  const rateLimiter = new MemoryRateLimiter();
  const invitation = invitations.seed({
    packageId: "rsvp-package",
    ownerId: options.ownerId,
    slug: options.slug,
    status: options.status,
    rsvpDeadline: options.rsvpDeadline,
    rsvpPartyLimit: options.rsvpPartyLimit,
    expiresAt: options.expiresAt,
  });
  const submit = new SubmitPublicRsvpUseCase(invitations, catalog, rsvp, rateLimiter, () => NOW);

  return { invitations, rsvp, catalog, rateLimiter, invitation, submit };
}

const SUBMISSION = {
  slug: SLUG,
  name: "  Ana   Pérez ",
  attending: true,
  partySize: 2,
  phone: "55 1234 5678",
  message: "  ¡Con gusto! ",
  honeypot: "",
  clientAddress: "198.18.0.10",
};

function issuesOf(error: unknown): string[] {
  return error instanceof InvalidRsvpResponseError ? [...error.issues] : [];
}

describe("UpdateRsvpSettingsUseCase (S4)", () => {
  it("stores the deadline and the party limit of the owner's invitation", async () => {
    const { invitations, rsvp } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const useCase = new UpdateRsvpSettingsUseCase(invitations, rsvp);

    const stored = await useCase.execute({
      ownerId: OWNER,
      id: invitation.id,
      deadline: "2026-12-31T23:59:59.000Z",
      partyLimit: 6,
    });

    assert.deepEqual(stored, { deadline: new Date("2026-12-31T23:59:59.000Z"), partyLimit: 6 });
    assert.equal(invitation.rsvpPartyLimit, 6);
    assert.equal(invitation.rsvpDeadline?.toISOString(), "2026-12-31T23:59:59.000Z");
  });

  it("clears the deadline with null", async () => {
    const { invitations, rsvp } = seeded({ rsvpDeadline: new Date("2026-12-31T00:00:00.000Z") });
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const useCase = new UpdateRsvpSettingsUseCase(invitations, rsvp);

    const stored = await useCase.execute({
      ownerId: OWNER,
      id: invitation.id,
      deadline: null,
      partyLimit: 4,
    });

    assert.deepEqual(stored, { deadline: null, partyLimit: 4 });
    assert.equal(invitation.rsvpDeadline, null);
  });

  it("answers null for another owner's invitation, an unknown id, and a malformed id, and stores nothing", async () => {
    const { invitations, rsvp } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const useCase = new UpdateRsvpSettingsUseCase(invitations, rsvp);

    for (const id of [invitation.id, UNKNOWN_ID, MALFORMED_ID]) {
      assert.equal(
        await useCase.execute({
          ownerId: randomUUID(),
          id,
          deadline: null,
          partyLimit: 9,
        }),
        null,
        id,
      );
    }
    assert.equal(invitation.rsvpPartyLimit, 4);
  });

  it("refuses an archived invitation with InvitationNotEditableError and keeps its settings", async () => {
    const { invitations, rsvp } = seeded({ status: "ARCHIVED" });
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const useCase = new UpdateRsvpSettingsUseCase(invitations, rsvp);

    await assert.rejects(
      useCase.execute({
        ownerId: OWNER,
        id: invitation.id,
        deadline: "2026-12-31T23:59:59.000Z",
        partyLimit: 9,
      }),
      InvitationNotEditableError,
    );
    assert.equal(invitation.rsvpPartyLimit, 4);
    assert.equal(invitation.rsvpDeadline, null);
  });

  it("reports the domain issues of a request it refuses and stores nothing", async () => {
    const { invitations, rsvp } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const useCase = new UpdateRsvpSettingsUseCase(invitations, rsvp);

    await assert.rejects(
      useCase.execute({
        ownerId: OWNER,
        id: invitation.id,
        deadline: "2026-12-31",
        partyLimit: 11,
      }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidRsvpSettingsError);
        assert.deepEqual(error.issues, [
          "deadline must be an ISO 8601 instant with an offset, or null",
          "partyLimit must be between 1 and 10",
        ]);
        return true;
      },
    );
    assert.equal(invitation.rsvpPartyLimit, 4);
  });

  it("reports the adapter's archived refusal when a concurrent archive wins", async () => {
    const { invitations, rsvp } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const useCase = new UpdateRsvpSettingsUseCase(invitations, rsvp);
    rsvp.refuseWrites = true;

    await assert.rejects(
      useCase.execute({
        ownerId: OWNER,
        id: invitation.id,
        deadline: null,
        partyLimit: 6,
      }),
      InvitationNotEditableError,
    );
    assert.equal(invitation.rsvpPartyLimit, 4);
  });
});

describe("GetRsvpResponsesUseCase (S1, S4)", () => {
  it("answers the settings, the responses newest first, and the totals", async () => {
    const { invitations, rsvp } = seeded({
      rsvpDeadline: new Date("2026-12-31T23:59:59.000Z"),
      rsvpPartyLimit: 6,
    });
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    const older = rsvp.seedResponse(invitation.id, {
      name: "Vieja",
      attending: true,
      partySize: 3,
      createdAt: new Date("2026-11-18T10:00:00.000Z"),
    });
    const newer = rsvp.seedResponse(invitation.id, {
      name: "Nueva",
      attending: false,
      partySize: 0,
      phone: null,
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    });
    const useCase = new GetRsvpResponsesUseCase(invitations, rsvp);

    const read = await useCase.execute(OWNER, invitation.id);

    assert.deepEqual(read?.settings, {
      deadline: new Date("2026-12-31T23:59:59.000Z"),
      partyLimit: 6,
    });
    assert.deepEqual(
      read?.responses.map((response) => response.id),
      [newer.id, older.id],
    );
    assert.deepEqual(read?.totals, { attendingPeople: 3, declinedCount: 1, responses: 2 });
    assert.equal(read?.slug, SLUG);
  });

  it("counts no people and no declines when nobody answered", async () => {
    const { invitations, rsvp } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;

    const read = await new GetRsvpResponsesUseCase(invitations, rsvp).execute(OWNER, invitation.id);

    assert.deepEqual(read?.responses, []);
    assert.deepEqual(read?.totals, { attendingPeople: 0, declinedCount: 0, responses: 0 });
  });

  it("answers null for another owner's invitation, an unknown id, and a malformed id", async () => {
    const { invitations, rsvp } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    rsvp.seedResponse(invitation.id);
    const useCase = new GetRsvpResponsesUseCase(invitations, rsvp);

    for (const [ownerId, id] of [
      [randomUUID(), invitation.id],
      [OWNER, UNKNOWN_ID],
      [OWNER, MALFORMED_ID],
    ] as const) {
      assert.equal(await useCase.execute(ownerId, id), null, id);
    }
  });
});

describe("SubmitPublicRsvpUseCase (S1, S4)", () => {
  it("stores the normalized response and answers the dedupe key it wrote", async () => {
    const { invitation, rsvp, submit } = seeded();

    await submit.execute(SUBMISSION);

    assert.equal(rsvp.responses.length, 1);
    assert.deepEqual(
      { ...rsvp.responses[0], id: undefined, createdAt: undefined, updatedAt: undefined },
      {
        id: undefined,
        invitationId: invitation.id,
        name: "Ana Pérez",
        dedupeKey: "ana perez|+525512345678",
        attending: true,
        partySize: 2,
        phone: "+525512345678",
        message: "¡Con gusto!",
        createdAt: undefined,
        updatedAt: undefined,
      },
    );
    assert.equal(rsvp.responses[0]?.updatedAt.getTime(), NOW.getTime());
  });

  it("answers the same 404 for a malformed, unknown, draft, archived, or expired slug, and stores nothing", async () => {
    const cases: Array<{ label: string; slug: string; stored: SeedOptions }> = [
      // The format is refused before any query, so the stored slug is irrelevant to this case.
      { label: "malformed", slug: "Invitacion-Malformed", stored: {} },
      { label: "unknown", slug: "invitacion-never0", stored: { slug: SLUG } },
      { label: "draft", slug: SLUG, stored: { status: "DRAFT" } },
      { label: "archived", slug: SLUG, stored: { status: "ARCHIVED" } },
      {
        label: "expired",
        slug: SLUG,
        stored: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
      },
    ];

    for (const { label, slug, stored } of cases) {
      const { rsvp, submit } = seeded(stored);

      assert.equal(await submit.execute({ ...SUBMISSION, slug }), false, label);
      assert.equal(rsvp.responses.length, 0, label);
    }
  });

  it("refuses a published invitation whose package grants no open RSVP", async () => {
    for (const packageKeys of [["COUNTDOWN", "MAP"], ["RSVP", "GUEST_LIST"], ["GUEST_LIST"]]) {
      const { rsvp, submit } = seeded({ packageKeys });

      await assert.rejects(submit.execute(SUBMISSION), RsvpNotOpenError, packageKeys.join(","));
      assert.equal(rsvp.responses.length, 0);
    }
    // The rate limit is not consumed for an invitation that never accepted the request.
    assert.equal(seeded({ packageKeys: ["COUNTDOWN"] }).rateLimiter.consumed.length, 0);
  });

  it("refuses a deadline that has passed and accepts one that has just arrived", async () => {
    const closed = seeded({ rsvpDeadline: new Date(NOW.getTime() - 1) });
    await assert.rejects(closed.submit.execute(SUBMISSION), RsvpNotOpenError);
    assert.equal(closed.rsvp.responses.length, 0);

    const open = seeded({ rsvpDeadline: NOW });
    await open.submit.execute(SUBMISSION);
    assert.equal(open.rsvp.responses.length, 1);
  });

  it("counts the submission once per invitation and client address, and refuses over the cap", async () => {
    const { invitation, rateLimiter, rsvp, submit } = seeded();

    await submit.execute(SUBMISSION);

    assert.deepEqual(rateLimiter.consumed, [
      { invitationId: invitation.id, clientAddress: "198.18.0.10" },
    ]);
    assert.equal(rsvp.responses.length, 1);

    rateLimiter.allow = false;
    await assert.rejects(
      submit.execute({ ...SUBMISSION, name: "Otra Persona" }),
      RsvpRateLimitedError,
    );
    assert.equal(rsvp.responses.length, 1, "a rate-limited submission stores nothing");
  });

  it("answers success without storing when the honeypot is filled, even with an invalid payload", async () => {
    const { rateLimiter, rsvp, submit } = seeded();

    await submit.execute({ ...SUBMISSION, honeypot: "https://spam.example", name: "" });
    await submit.execute({ ...SUBMISSION, honeypot: "   " });

    assert.equal(rsvp.responses.length, 0);
    // It is still a request: it is counted, and it looks exactly like a stored one to the caller.
    assert.equal(rateLimiter.consumed.length, 2);
  });

  it("reports the domain issues of a response it refuses, and stores nothing", async () => {
    const { rsvp, submit } = seeded({ rsvpPartyLimit: 2 });

    await assert.rejects(submit.execute({ ...SUBMISSION, partySize: 3 }), (error: unknown) => {
      assert.ok(error instanceof InvalidRsvpResponseError);
      assert.deepEqual(error.issues, ["partySize must be between 1 and 2 when attending"]);
      return true;
    });
    assert.equal(rsvp.responses.length, 0);
    assert.deepEqual(
      issuesOf(
        await submit
          .execute({ ...SUBMISSION, name: "", message: "x".repeat(281) })
          .catch((error: unknown) => error),
      ),
      ["name must be between 1 and 80 characters", "message must be at most 280 characters"],
    );
    assert.equal(rsvp.responses.length, 0);
  });

  it("updates the one response of a guest who submits twice, and keeps two guests apart", async () => {
    const { rsvp, submit } = seeded();

    await submit.execute(SUBMISSION);
    const first = rsvp.responses[0] as RsvpResponseRecord;
    await submit.execute({
      ...SUBMISSION,
      name: "ANA PEREZ",
      phone: "(55) 1234-5678",
      partySize: 3,
      message: "Cambié de idea",
    });

    assert.equal(rsvp.responses.length, 1, "the normalized name and phone dedupe the retry");
    assert.equal(rsvp.responses[0]?.id, first.id);
    assert.equal(rsvp.responses[0]?.partySize, 3);
    assert.equal(rsvp.responses[0]?.message, "Cambié de idea");
    assert.equal(rsvp.responses[0]?.createdAt.getTime(), first.createdAt.getTime());

    await submit.execute({ ...SUBMISSION, name: "Otra Persona", phone: null });
    assert.equal(rsvp.responses.length, 2);
  });

  it("refuses the write when the invitation stopped accepting it between the read and the insert", async () => {
    const { invitations, rsvp, submit } = seeded();
    const invitation = invitations.rows[0] as InvitationRecordWithMusic;
    // The read in the use case sees an open invitation; the write finds it archived.
    const writing = rsvp.upsertResponse.bind(rsvp);
    rsvp.upsertResponse = async (invitationId, response, at) => {
      invitation.status = "ARCHIVED";
      return writing(invitationId, response, at);
    };

    await assert.rejects(submit.execute(SUBMISSION), RsvpNotOpenError);
    assert.equal(rsvp.responses.length, 0);
  });
});
