import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  InvalidInvitationContentError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
} from "../application/invitation.application.errors";
import type { InvitationSummary, OwnedInvitation } from "../application/invitation.use-cases";
import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import {
  InvitationAlreadyArchivedError,
  InvitationNotEditableError,
} from "../domain/invitation.errors";

// The stable REST shapes of an invitation (M4 T4; S1, S7, S9). `ownerId` is deliberately absent: it comes from
// the session and never belongs in a response (S9). An id that names nothing, or names another customer's
// invitation, answers the same 404 (A4), so a response never confirms that a foreign row exists.

/** The stable REST shape of one row of "Mis invitaciones". */
export interface InvitationSummaryResponse {
  id: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One invitation as its owner edits it: the stored fields, the content, and the fields it still lacks (S7). */
export interface OwnedInvitationResponse extends InvitationSummaryResponse {
  content: JsonObject;
  missingRequiredFields: string[];
}

export function toInvitationSummaryResponse(stored: InvitationSummary): InvitationSummaryResponse {
  return {
    id: stored.id,
    templateVersionId: stored.templateVersionId,
    packageId: stored.packageId,
    slug: stored.slug,
    status: stored.status,
    archivedAt: stored.archivedAt?.toISOString() ?? null,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

export function toOwnedInvitationResponse(stored: OwnedInvitation): OwnedInvitationResponse {
  return {
    ...toInvitationSummaryResponse(stored),
    content: stored.content,
    missingRequiredFields: [...stored.missingRequiredFields],
  };
}

/**
 * The answer for an invitation the session user does not own: no row has this id, or another customer has it
 * (A4). Both answer the same 404 with the same body, so nothing tells a foreign id apart from an unknown one.
 */
function notFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

export function orOwnedInvitationNotFound(stored: OwnedInvitation | null): OwnedInvitationResponse {
  return stored === null ? notFound() : toOwnedInvitationResponse(stored);
}

export function orInvitationSummaryNotFound(
  stored: InvitationSummary | null,
): InvitationSummaryResponse {
  return stored === null ? notFound() : toInvitationSummaryResponse(stored);
}

/**
 * Maps an invitation error to its HTTP outcome; any other error is rethrown unchanged.
 *
 * - a version that is missing or not published, and a package that does not exist, are 404: nothing to pin or
 *   nothing to check, and the caller learns nothing about a catalog it may not read;
 * - a package that does not fit is 400 with `INVITATION_PACKAGE_DOES_NOT_FIT`: the request is well formed, the
 *   API has no 422 anywhere, and a stable code is what the client branches on;
 * - content the pinned schema refuses is 400 with its issues (S3, S7);
 * - an archived invitation is 409 with `INVITATION_NOT_EDITABLE`, or `INVITATION_ALREADY_ARCHIVED` for a
 *   repeated archive (A3, S7);
 * - no storable slug is 503 `INVITATION_SLUG_UNAVAILABLE`: the request is right, the server could not draw one.
 */
export function mapInvitationError(error: unknown): never {
  if (error instanceof InvitationTemplateVersionNotPublishedError) {
    throw new NotFoundException({ code: "INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED" });
  }
  if (error instanceof InvitationPackageNotFoundError) {
    throw new NotFoundException({ code: "INVITATION_PACKAGE_NOT_FOUND" });
  }
  if (error instanceof InvitationPackageDoesNotFitError) {
    throw new BadRequestException({ code: "INVITATION_PACKAGE_DOES_NOT_FIT" });
  }
  if (error instanceof InvalidInvitationContentError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_CONTENT",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationNotEditableError) {
    throw new ConflictException({ code: "INVITATION_NOT_EDITABLE" });
  }
  if (error instanceof InvitationAlreadyArchivedError) {
    throw new ConflictException({ code: "INVITATION_ALREADY_ARCHIVED" });
  }
  if (error instanceof InvitationSlugUnavailableError) {
    throw new ServiceUnavailableException({ code: "INVITATION_SLUG_UNAVAILABLE" });
  }
  throw error;
}
