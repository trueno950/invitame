import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { InvitationNotEditableError } from "../domain/invitation.errors";
import type {
  CatalogPackageEntitlements,
  CatalogTemplateVersionSnapshot,
  CatalogVersionRenderData,
  CatalogVersionSchema,
  InvitationCatalog,
} from "./invitation-catalog";
import type { InvitationCatalog as CatalogContract } from "./invitation-catalog";
import { verifyInvitationPassword } from "./invitation-password";
import {
  InvalidInvitationPasswordError,
  InvitationPasswordNotAvailableError,
} from "./invitation-password.errors";
import {
  ClearInvitationPasswordUseCase,
  SetInvitationPasswordUseCase,
} from "./invitation-password.use-cases";
import type {
  InvitationPasswordState,
  InvitationRecordWithMusic,
  InvitationRepository,
} from "./invitation.repository";

// The owner's two access-code writes (F13; S2.13, L18.1, L18.5). The suite observes what the port stored — a hash that
// verifies and never the plain value — the version each write raises, the catalog gate on the set, and the fact that the
// removal stays available when the catalog withdrew the key.

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "44444444-4444-4444-8444-444444444444";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const PACKAGE = "99999999-9999-4999-8999-999999999999";
const PASSWORD = "clave-familiar";

/** The invitation port as these use cases use it: one owned read and the two access-code writes. */
class MemoryInvitations implements InvitationRepository {
  readonly rows = new Map<string, InvitationRecordWithMusic>();
  readonly stored: Array<{ hash: string; version: number }> = [];

  seed(ownerId = OWNER, status: "DRAFT" | "ARCHIVED" = "DRAFT"): InvitationRecordWithMusic {
    const at = new Date("2026-12-16T10:00:00.000Z");
    const row: InvitationRecordWithMusic = {
      id: INVITATION,
      ownerId,
      templateVersionId: randomUUID(),
      packageId: PACKAGE,
      slug: "boda-protegida",
      status,
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
      passwordProtected: false,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      places: {},
      archivedAt: status === "ARCHIVED" ? at : null,
      publishedAt: null,
      firstPublishedAt: null,
      expiresAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.set(row.id, row);

    return row;
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.get(id);

    return row !== undefined && row.ownerId === ownerId ? { ...row } : null;
  }

  async setPassword(
    ownerId: string,
    id: string,
    passwordHash: string,
  ): Promise<InvitationPasswordState | null> {
    const row = await this.findOwned(ownerId, id);
    if (row === null) {
      return null;
    }
    const version = this.stored.length + 1;
    this.stored.push({ hash: passwordHash, version });

    return { passwordProtected: true, passwordVersion: version };
  }

  async clearPassword(ownerId: string, id: string): Promise<InvitationPasswordState | null> {
    const row = await this.findOwned(ownerId, id);
    if (row === null) {
      return null;
    }

    return { passwordProtected: false, passwordVersion: this.stored.length + 1 };
  }

  notUsed(): never {
    throw new Error("the access-code use cases read one owned invitation and write the code");
  }

  create = async () => this.notUsed();
  listOwned = async () => this.notUsed();
  listSharedWith = async () => this.notUsed();
  updateContent = async () => this.notUsed();
  updateFeatures = async () => this.notUsed();
  updatePlace = async () => this.notUsed();
  clearPlace = async () => this.notUsed();
  archive = async () => this.notUsed();
  publish = async () => this.notUsed();
  unpublish = async () => this.notUsed();
  findPublishedBySlug = async () => this.notUsed();
  findPublishedByAlias = async () => this.notUsed();
  countSlugAliases = async () => this.notUsed();
  isSlugInUse = async () => this.notUsed();
  renameSlug = async () => this.notUsed();
}

/** The catalog contract as the set reads it: one package, with or without the key. */
class MemoryCatalog implements InvitationCatalog {
  keys: string[] = ["PASSWORD_PROTECTION"];

  async findPackageEntitlements(): Promise<CatalogPackageEntitlements | null> {
    return { status: "ACTIVE", includedFeatureKeys: this.keys, durationDays: 180 };
  }

  findPublishedVersion = async (): Promise<CatalogTemplateVersionSnapshot | null> => null;
  findVersionSchema = async (): Promise<CatalogVersionSchema | null> => null;
  findVersionRenderData = async (): Promise<CatalogVersionRenderData | null> => null;
  isRendererRegistered = (): boolean => false;
}

function setUseCase(
  invitations: MemoryInvitations,
  catalog: MemoryCatalog,
): SetInvitationPasswordUseCase {
  return new SetInvitationPasswordUseCase(invitations, catalog as CatalogContract);
}

describe("SetInvitationPasswordUseCase (L18.1, L18.5)", () => {
  it("stores only the hash and answers whether a code is set and the new version", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed();
    const state = await setUseCase(invitations, new MemoryCatalog()).execute({
      ownerId: OWNER,
      id: INVITATION,
      password: `  ${PASSWORD}  `,
    });

    assert.deepEqual(state, { passwordProtected: true, passwordVersion: 1 });
    assert.equal(invitations.stored.length, 1);
    const stored = invitations.stored[0];
    assert.ok(stored);
    // The stored value is the encoded scrypt hash of the trimmed code, never the code itself.
    assert.equal(stored.hash.includes(PASSWORD), false);
    assert.equal(stored.hash.startsWith("scrypt$"), true);
    assert.equal(await verifyInvitationPassword(stored.hash, PASSWORD), true);
    assert.equal(await verifyInvitationPassword(stored.hash, "otra-clave"), false);
  });

  it("raises the version on every set, so an older token stops opening the invitation", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed();
    const useCase = setUseCase(invitations, new MemoryCatalog());

    assert.deepEqual(
      await useCase.execute({ ownerId: OWNER, id: INVITATION, password: "primera" }),
      {
        passwordProtected: true,
        passwordVersion: 1,
      },
    );
    assert.deepEqual(
      await useCase.execute({ ownerId: OWNER, id: INVITATION, password: "segunda" }),
      {
        passwordProtected: true,
        passwordVersion: 2,
      },
    );
    // Two different stored hashes: a new salt for the new code.
    assert.notEqual(invitations.stored[0]?.hash, invitations.stored[1]?.hash);
  });

  it("refuses a pinned package that does not grant PASSWORD_PROTECTION, and stores nothing (L18.5)", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed();
    const catalog = new MemoryCatalog();
    catalog.keys = ["ITINERARY", "GUEST_LIST"];

    await assert.rejects(
      () =>
        setUseCase(invitations, catalog).execute({
          ownerId: OWNER,
          id: INVITATION,
          password: PASSWORD,
        }),
      InvitationPasswordNotAvailableError,
    );
    assert.deepEqual(invitations.stored, []);
  });

  it("refuses a code the domain refuses, and stores nothing", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed();

    for (const password of ["abc", "a".repeat(41), 1234, null, "clave\u0000familiar"]) {
      await assert.rejects(
        () =>
          setUseCase(invitations, new MemoryCatalog()).execute({
            ownerId: OWNER,
            id: INVITATION,
            password,
          }),
        (error: unknown) =>
          error instanceof InvalidInvitationPasswordError && error.issues.length > 0,
      );
    }
    assert.deepEqual(invitations.stored, []);
  });

  it("answers null for an id that names nothing or another owner's invitation (A4)", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed(OTHER_OWNER);

    assert.equal(
      await setUseCase(invitations, new MemoryCatalog()).execute({
        ownerId: OWNER,
        id: INVITATION,
        password: PASSWORD,
      }),
      null,
    );
    assert.deepEqual(invitations.stored, []);
  });

  it("propagates the archived refusal, so a read-only invitation never gets a code (A2)", async () => {
    const invitations = new MemoryInvitations();
    const archived = invitations.seed(OWNER, "ARCHIVED");
    // The port is the one that refuses an archived write; this double states the same refusal the real adapter throws.
    const port: InvitationRepository = Object.assign(Object.create(invitations), {
      findOwned: async () => ({ ...archived }),
      setPassword: async () => {
        throw new InvitationNotEditableError("ARCHIVED");
      },
    });

    await assert.rejects(
      () =>
        new SetInvitationPasswordUseCase(port, new MemoryCatalog() as CatalogContract).execute({
          ownerId: OWNER,
          id: INVITATION,
          password: PASSWORD,
        }),
      InvitationNotEditableError,
    );
  });
});

describe("ClearInvitationPasswordUseCase (L18.1, L18.5)", () => {
  it("removes a stored code after the catalog withdrew the key, and raises the version", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed();
    const catalog = new MemoryCatalog();
    // The code is set while the package still grants the key, so there really is a code to remove.
    await setUseCase(invitations, catalog).execute({
      ownerId: OWNER,
      id: INVITATION,
      password: PASSWORD,
    });
    assert.equal(
      invitations.stored.length,
      1,
      "a code must be set before its removal proves anything",
    );
    assert.equal(await verifyInvitationPassword(invitations.stored[0]?.hash ?? "", PASSWORD), true);
    // The package withdraws the key: setting a new code is refused, and the owner must still be able to open their own
    // invitation again.
    catalog.keys = [];
    await assert.rejects(
      () =>
        setUseCase(invitations, catalog).execute({
          ownerId: OWNER,
          id: INVITATION,
          password: "otra-clave",
        }),
      InvitationPasswordNotAvailableError,
    );

    const state = await new ClearInvitationPasswordUseCase(invitations).execute({
      ownerId: OWNER,
      id: INVITATION,
    });

    assert.deepEqual(state, { passwordProtected: false, passwordVersion: 2 });
    assert.equal(invitations.stored.length, 1, "the removal stores no new hash");
  });

  it("answers null for an id that names nothing or another owner's invitation (A4)", async () => {
    const invitations = new MemoryInvitations();
    invitations.seed(OTHER_OWNER);

    assert.equal(
      await new ClearInvitationPasswordUseCase(invitations).execute({
        ownerId: OWNER,
        id: INVITATION,
      }),
      null,
    );
  });
});
