import {
  type JsonObject,
  missingRequiredFields,
  validateDraftContent,
} from "../domain/invitation-content";
import { archive, assertEditable, type InvitationStatus } from "../domain/invitation-lifecycle";
import { generateInvitationSlug, isReservedSlug } from "../domain/invitation-slug";
import { packageFitsTemplateVersion } from "../domain/package-fit";
import {
  InvalidInvitationContentError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationSlugTakenError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
} from "./invitation.application.errors";
import type {
  InvitationRecord,
  InvitationRepository,
  NewInvitation,
} from "./invitation.repository";
import type { InvitationCatalog } from "./invitation-catalog";

// The invitation use cases (M4 T3; S1, S3, S6, S7, S9, A1, A3, A4). Creating and editing a draft is free for
// any signed-in customer: the chosen package is only validated against the pinned version's renderer, and
// payment belongs to publication (M5/M7). Every command receives the owner from the caller, which the route
// reads from the session (S9); no command accepts an owner in its payload, and every read or write goes
// through a port whose query carries that owner (S9, A4). Nothing is deleted: archiving is the only lifecycle
// write of M4 (S7, A3).

/** How many slugs one create request may try before it reports that no slug is available (S5). */
export const MAX_SLUG_ATTEMPTS = 5;

/**
 * Where a new draft's slug comes from. The module injects the domain generator over `Math.random`; a test
 * injects a deterministic sequence, which is the only way to observe the retry and the reserved-word skip.
 */
export type InvitationSlugSource = () => string;

/** The generated public slug (S5): a neutral prefix and six random characters, never derived from the owner. */
const DEFAULT_SLUG_SOURCE: InvitationSlugSource = () => generateInvitationSlug(Math.random);

/** The values of a create request; `ownerId` comes from the session, never from the request payload (S9). */
export interface CreateDraftInput {
  ownerId: string;
  templateVersionId: string;
  packageId: string;
}

/** The values of a content update; the owner again comes from the session (S9). */
export interface UpdateContentInput {
  ownerId: string;
  id: string;
  content: unknown;
}

/** A row of "Mis invitaciones": the editor loads one invitation when it opens it. */
export interface InvitationSummary {
  id: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One invitation as its owner edits it: the stored fields, the bounded content, and the required fields the
 * draft does not provide yet (S7). The owner id is deliberately absent: it came from the session and never
 * belongs in a response.
 */
export interface OwnedInvitation extends InvitationSummary {
  content: JsonObject;
  missingRequiredFields: string[];
}

const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value can name a stored row. An id that is not a UUID names nothing and would make PostgreSQL
 * refuse the cast, so the use cases answer "not found" before reaching a port.
 */
function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && INVITATION_ID.test(value);
}

function toSummary(record: InvitationRecord): InvitationSummary {
  return {
    id: record.id,
    templateVersionId: record.templateVersionId,
    packageId: record.packageId,
    slug: record.slug,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** The owner's view of one invitation, with the schema of the version it is pinned to. */
function toOwnedInvitation(record: InvitationRecord, schema: unknown): OwnedInvitation {
  return {
    ...toSummary(record),
    content: record.content,
    missingRequiredFields: missingRequiredFields(schema, record.content),
  };
}

/**
 * Creates a free DRAFT pinned to a PUBLISHED version (S1, S3, S6, S7). The version must be published and its
 * template too; the package must exist and fit what the version's renderer needs (A1); the content starts as
 * an empty object, so the draft is incomplete until the owner fills it. The slug is generated, reserved words
 * are skipped, and only a unique-slug collision is retried, at most `MAX_SLUG_ATTEMPTS` times. Throws
 * `InvitationTemplateVersionNotPublishedError`, `InvitationPackageNotFoundError`,
 * `InvitationPackageDoesNotFitError`, and `InvitationSlugUnavailableError`.
 */
export class CreateInvitationDraftUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly nextSlug: InvitationSlugSource = DEFAULT_SLUG_SOURCE,
  ) {}

  async execute(input: CreateDraftInput): Promise<OwnedInvitation> {
    // A malformed id names no catalog record; report it as missing instead of letting PostgreSQL refuse it.
    if (!isInvitationId(input.templateVersionId)) {
      throw new InvitationTemplateVersionNotPublishedError();
    }
    if (!isInvitationId(input.packageId)) {
      throw new InvitationPackageNotFoundError();
    }

    const version = await this.catalog.findPublishedVersion(input.templateVersionId);
    if (version === null) {
      throw new InvitationTemplateVersionNotPublishedError();
    }

    const entitlements = await this.catalog.findPackageEntitlements(input.packageId);
    if (entitlements === null) {
      throw new InvitationPackageNotFoundError();
    }
    if (
      !packageFitsTemplateVersion(
        {
          packageStatus: entitlements.status,
          includedFeatureKeys: entitlements.includedFeatureKeys,
        },
        version.requiredFeatureKeys,
      )
    ) {
      throw new InvitationPackageDoesNotFitError(input.packageId);
    }

    const created = await this.createWithGeneratedSlug({
      ownerId: input.ownerId,
      templateVersionId: version.id,
      packageId: input.packageId,
      content: {},
    });

    return toOwnedInvitation(created, version.schema);
  }

  /**
   * Stores the draft with a generated slug. PostgreSQL's unique index is the only uniqueness guard (S3), so a
   * collision is an ordinary outcome: it draws again, and only a collision is retried. Any other failure is
   * reported as it is, because a second attempt would not fix it.
   */
  private async createWithGeneratedSlug(
    input: Omit<NewInvitation, "slug">,
  ): Promise<InvitationRecord> {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.drawSlug();
      try {
        return await this.invitations.create({ ...input, slug });
      } catch (error) {
        if (!(error instanceof InvitationSlugTakenError)) {
          throw error;
        }
      }
    }

    throw new InvitationSlugUnavailableError();
  }

  /** A generated slug that is not a reserved word; a reserved draw is skipped, never attempted (S5). */
  private drawSlug(): string {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.nextSlug();
      if (!isReservedSlug(slug)) {
        return slug;
      }
    }

    throw new InvitationSlugUnavailableError();
  }
}

/** The owner's invitations, newest first (S1). An owner without invitations gets an empty list. */
export class ListOwnInvitationsUseCase {
  constructor(private readonly invitations: InvitationRepository) {}

  async execute(ownerId: string): Promise<InvitationSummary[]> {
    return (await this.invitations.listOwned(ownerId)).map(toSummary);
  }
}

/**
 * One invitation of the owner (S7, A4), with the required fields it still lacks. The schema comes from the
 * pinned version, whatever that version's current status is, so a draft keeps validating and reporting missing
 * data after the catalog publishes a newer version (S3). Another owner's id answers null.
 */
export class GetOwnInvitationUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
  ) {}

  async execute(ownerId: string, id: string): Promise<OwnedInvitation | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }

    const snapshot = await this.catalog.findVersionSchema(stored.templateVersionId);

    return toOwnedInvitation(stored, snapshot?.schema ?? null);
  }
}

/**
 * Replaces the bounded content of a DRAFT (S7). Only a DRAFT changes (A3); the content is validated against
 * the pinned version's schema, which is read regardless of the version's status (S3). Throws
 * `InvitationNotEditableError` for an archived invitation and `InvalidInvitationContentError` with the issues
 * for content the pinned schema refuses; either way nothing is stored. Another owner's id answers null (A4).
 */
export class UpdateInvitationContentUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
  ) {}

  async execute(input: UpdateContentInput): Promise<OwnedInvitation | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    // A read-only invitation is refused before its content is even looked at (S7, A3).
    assertEditable(stored.status);

    const snapshot = await this.catalog.findVersionSchema(stored.templateVersionId);
    const validation = validateDraftContent(snapshot?.schema ?? null, input.content);
    if (!validation.ok) {
      throw new InvalidInvitationContentError(validation.issues);
    }

    const updated = await this.invitations.updateContent(input.ownerId, input.id, validation.value);
    if (updated === null) {
      return null;
    }

    return toOwnedInvitation(updated, snapshot?.schema ?? null);
  }
}

/**
 * Archives a DRAFT: it becomes read-only and stays stored, because an invitation is never deleted (S7, A3).
 * Throws `InvitationAlreadyArchivedError` for an invitation that is already archived, so a repeated archive
 * never looks like a change. Another owner's id answers null and changes nothing (A4).
 */
export class ArchiveInvitationUseCase {
  constructor(private readonly invitations: InvitationRepository) {}

  async execute(ownerId: string, id: string): Promise<InvitationSummary | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    // The domain states the transition; the adapter repeats it inside the write as the last guard.
    archive(stored.status);

    const archived = await this.invitations.archive(ownerId, id);

    return archived === null ? null : toSummary(archived);
  }
}
