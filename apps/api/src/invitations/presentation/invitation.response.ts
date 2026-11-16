import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  InvalidInvitationContentError,
  InvalidInvitationFeaturesError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationPaymentRequiredError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
} from "../application/invitation.application.errors";
import type { InvitationSummary, OwnedInvitation } from "../application/invitation.use-cases";
import type { PublicInvitation } from "../application/invitation-public";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";

// The stable REST shapes of an invitation (M4 T4 and M5 T4; S1, S3, S7, S9, A3, A4, A7). `ownerId` is
// deliberately absent: it comes from the session and never belongs in a response (S9). An id that names nothing,
// or names another customer's invitation, answers the same 404 (A4), so a response never confirms that a foreign
// row exists. `expiresAt` is absent too: Milestone 5 never writes an expiry and no client may rely on one (S8).

/**
 * The stable REST shape of one row of "Mis invitaciones". `publishedAt` is the publication instant, null while
 * the invitation is a draft; it is what the owner sees instead of the database's unused `expiresAt` (S7, S8).
 */
export interface InvitationSummaryResponse {
  id: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One invitation as its owner edits it: the stored fields, the content, the feature data, the gated features the
 * guest will see, and the fields it still lacks (F1; S4, S7).
 */
export interface OwnedInvitationResponse extends InvitationSummaryResponse {
  content: JsonObject;
  missingRequiredFields: string[];
  /** The stored IANA zone (S4). */
  timeZone: string;
  /**
   * The stored feature data; `whatsappPhone` is E.164 or null, and `playlistUrl` is a normalized `https` link on
   * an allow-listed music host or null (S4, S7).
   */
  featureSettings: { whatsappPhone: string | null; playlistUrl: string | null };
  /** The gated feature keys the guest will see, `CALENDAR` included (S4). */
  availableFeatures: string[];
}

/**
 * What a guest's page renders (M5 T4, F1; S2, S3, S4, A7): the renderer identity, its configuration, the content
 * keys the pinned schema declares, the slug, the publication instant, the invitation's time zone, and the gated
 * features. Nothing else is here, so no owner, package, price, status, package feature key, or internal id can
 * leak by accident (S4).
 */
export interface PublicInvitationResponse {
  slug: string;
  componentKey: string;
  configuration: unknown;
  content: JsonObject;
  publishedAt: string | null;
  timeZone: string;
  features: {
    countdown: boolean;
    map: boolean;
    calendar: true;
    whatsapp: { phone: string } | null;
    /** The playlist link and the service it names, or null when the feature is not available (S7). */
    music: { url: string; provider: string } | null;
    /** Whether the layouts render their gift registry block (S7). */
    giftRegistry: boolean;
  };
}

export function toInvitationSummaryResponse(stored: InvitationSummary): InvitationSummaryResponse {
  return {
    id: stored.id,
    templateVersionId: stored.templateVersionId,
    packageId: stored.packageId,
    slug: stored.slug,
    status: stored.status,
    publishedAt: stored.publishedAt?.toISOString() ?? null,
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
    timeZone: stored.timeZone,
    featureSettings: {
      whatsappPhone: stored.featureSettings.whatsappPhone,
      playlistUrl: stored.featureSettings.playlistUrl,
    },
    availableFeatures: [...stored.availableFeatures],
  };
}

/** The guest's page of a published invitation, mapped from the application projection (A7, S4). */
export function toPublicInvitationResponse(stored: PublicInvitation): PublicInvitationResponse {
  return {
    slug: stored.slug,
    componentKey: stored.componentKey,
    configuration: stored.configuration,
    content: stored.content,
    publishedAt: stored.publishedAt?.toISOString() ?? null,
    timeZone: stored.timeZone,
    features: {
      countdown: stored.features.countdown,
      map: stored.features.map,
      calendar: true,
      whatsapp:
        stored.features.whatsapp === null ? null : { phone: stored.features.whatsapp.phone },
      music:
        stored.features.music === null
          ? null
          : { url: stored.features.music.url, provider: stored.features.music.provider },
      giftRegistry: stored.features.giftRegistry,
    },
  };
}

/**
 * The guest-facing 404 (A3): one answer for a slug that is malformed, unknown, a draft, archived, expired, or
 * published with a renderer this deployment cannot render. Nothing distinguishes those cases to a guest, so a
 * 404 never confirms that an invitation exists but is not visible.
 */
export function publicInvitationNotFound(): never {
  throw new NotFoundException({ code: "PUBLIC_INVITATION_NOT_FOUND" });
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
 * - feature data the domain refuses is 400 `INVALID_INVITATION_FEATURES` with its issues (F1; S4);
 * - an archived invitation is 409 with `INVITATION_NOT_EDITABLE`, or `INVITATION_ALREADY_ARCHIVED` for a
 *   repeated archive (A3, S7);
 * - a publication the lifecycle refuses is 409 with `INVITATION_ALREADY_PUBLISHED` or `INVITATION_NOT_PUBLISHED`,
 *   so each wrong status has its own stable code and a repeated publish never looks like a change (S7, A2);
 * - an invitation that is not ready to publish is 409 `INVITATION_NOT_PUBLISHABLE` with the readiness issues:
 *   publishing a row whose content, package, or pinned version is not ready is a state conflict, not a
 *   malformed request, and this API uses no 422 (A1);
 * - a publication the payment gate refuses is 402 `INVITATION_PAYMENT_REQUIRED` with the gate's `reason`: the
 *   invitation is ready and only a payment is missing, which is what 402 Payment Required states. The `reason`
 *   is the machine-readable code the gate answered, never a provider payload (S6);
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
  if (error instanceof InvalidInvitationFeaturesError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_FEATURES",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationNotEditableError) {
    throw new ConflictException({ code: "INVITATION_NOT_EDITABLE" });
  }
  if (error instanceof InvitationAlreadyArchivedError) {
    throw new ConflictException({ code: "INVITATION_ALREADY_ARCHIVED" });
  }
  if (error instanceof InvitationAlreadyPublishedError) {
    throw new ConflictException({ code: "INVITATION_ALREADY_PUBLISHED" });
  }
  if (error instanceof InvitationNotPublishedError) {
    throw new ConflictException({ code: "INVITATION_NOT_PUBLISHED" });
  }
  if (error instanceof InvitationNotPublishableError) {
    throw new ConflictException({
      code: "INVITATION_NOT_PUBLISHABLE",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationPaymentRequiredError) {
    throw new HttpException(
      { code: "INVITATION_PAYMENT_REQUIRED", reason: error.reason },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
  if (error instanceof InvitationSlugUnavailableError) {
    throw new ServiceUnavailableException({ code: "INVITATION_SLUG_UNAVAILABLE" });
  }
  throw error;
}
