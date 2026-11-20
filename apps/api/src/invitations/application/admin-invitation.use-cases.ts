import type { AdminActionReason } from "../../admin/admin-action-recorder";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { AdminInvitationRepository, AdminInvitationRow } from "./admin-invitation.repository";
import { decodeInvitationCursor, encodeInvitationCursor } from "./invitation-cursor";
import type { InvitationMediaCounts, InvitationMediaCountReader } from "./invitation-media-counts";
import type { InvitationOwnerEmailReader } from "./invitation-owner-email";
import {
  INVITATION_PAYMENT_DETAIL_LIMIT,
  type InvitationPaymentReader,
  type InvitationPaymentSummary,
} from "./invitation-payment-summary";

// The administrator's invitation status view (M9 T2; S1, L3, L4): search one invitation's operational state — its
// lifecycle dates, its payment, and its photo counts — without the personal data the owner decided to keep out. The
// view is admin-only, read-only, and bounded: a page, a slug prefix, one status, and an opaque cursor.
//
// Every facet that belongs to another module arrives through a port this module declares (payments, media, and the
// owner's email), so these use cases never query another module's tables. One page asks each port once with every id
// it needs, so a page of twenty rows costs three reads, never sixty.

/**
 * How many payments the detail view shows: the newest twenty, which is enough to explain a state (S1). It is the
 * port's own documented maximum, so the view that asks and the adapter that clamps cannot drift apart.
 */
export const ADMIN_INVITATION_DETAIL_PAYMENT_LIMIT = INVITATION_PAYMENT_DETAIL_LIMIT;

/**
 * The cursor a client sent cannot have been written by this API: it is not base64url, not the JSON this module
 * encodes, or its fields are not a real instant and a stored id. Presentation answers 400 and nothing is read.
 */
export class InvalidInvitationCursorError extends Error {
  constructor() {
    super("The page cursor is malformed.");
    this.name = "InvalidInvitationCursorError";
  }
}

/** One row of the status view: the contract's summary fields and nothing else (S1, L3). */
export interface AdminInvitationSummary {
  invitationId: string;
  slug: string;
  status: InvitationStatus;
  /**
   * The owner's email, the only owner field the status view shows (L3). It is null only when no owner row answers for
   * the stored id, which the RESTRICT reference makes unreachable in practice.
   */
  ownerEmail: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  archivedAt: Date | null;
  refundRequestedAt: Date | null;
  /** The newest payment of the invitation, or null while it has none. */
  latestPayment: InvitationPaymentSummary | null;
  media: InvitationMediaCounts;
}

/** One bounded page: at most `limit` summaries, newest first, and the cursor of the row to continue after (S1). */
export interface AdminInvitationPage {
  items: AdminInvitationSummary[];
  nextCursor: string | null;
}

/** One invitation as the detail page reads it: the summary plus its pinned references and its newest payments. */
export interface AdminInvitationDetail extends AdminInvitationSummary {
  /**
   * The owner's id, the additive reference of T8 (S4): the support card needs it to address the owner's account, and
   * it is an identifier, never personal data like the display name the view never answers.
   */
  ownerId: string;
  packageId: string;
  templateVersionId: string;
  /** The newest payments, at most `ADMIN_INVITATION_DETAIL_PAYMENT_LIMIT`, newest first. */
  payments: InvitationPaymentSummary[];
}

/** What the administrator's search accepts: the filters, the bound, and the cursor as it arrived. */
export interface AdminInvitationListQuery {
  /** A case-insensitive slug prefix, or null for every slug. */
  slug: string | null;
  status: InvitationStatus | null;
  limit: number;
  /** The opaque cursor a previous page answered, or null for the first page. */
  cursor: string | null;
}

/** The stored counts of an invitation, defaulted to nothing when the media port answers no row for it. */
function mediaOf(
  counts: Map<string, InvitationMediaCounts>,
  invitationId: string,
): InvitationMediaCounts {
  return counts.get(invitationId) ?? { mainPhoto: false, galleryCount: 0 };
}

function toSummary(
  row: AdminInvitationRow,
  payments: Map<string, InvitationPaymentSummary>,
  counts: Map<string, InvitationMediaCounts>,
  emails: Map<string, string>,
): AdminInvitationSummary {
  return {
    invitationId: row.invitationId,
    slug: row.slug,
    status: row.status,
    ownerEmail: emails.get(row.ownerId) ?? null,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    firstPublishedAt: row.firstPublishedAt,
    archivedAt: row.archivedAt,
    refundRequestedAt: row.refundRequestedAt,
    latestPayment: payments.get(row.invitationId) ?? null,
    media: mediaOf(counts, row.invitationId),
  };
}

/**
 * One page of the administrator's invitation search (M9 T2; S1, L4): the slug prefix, the status filter, and the
 * key-set cursor, each optional. The page is newest first by `(createdAt, id)`, so a row created between two requests
 * never shifts a later page. Each facet is read once for the whole page; a page with no rows asks nobody.
 */
export class ListAdminInvitationsUseCase {
  constructor(
    private readonly invitations: AdminInvitationRepository,
    private readonly payments: InvitationPaymentReader,
    private readonly media: InvitationMediaCountReader,
    private readonly owners: InvitationOwnerEmailReader,
  ) {}

  async execute(query: AdminInvitationListQuery): Promise<AdminInvitationPage> {
    const after = query.cursor === null ? null : decodeInvitationCursor(query.cursor);
    if (query.cursor !== null && after === null) {
      // The refusal happens before any read, so a malformed cursor costs the database nothing.
      throw new InvalidInvitationCursorError();
    }

    // One row more than the page is the whole "is there another page" test: it needs no second query.
    const rows = await this.invitations.listForAdmin({
      slugPrefix: query.slug,
      status: query.status,
      after,
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > query.limit && last !== undefined
        ? encodeInvitationCursor({ createdAt: last.createdAt, id: last.invitationId })
        : null;

    if (page.length === 0) {
      return { items: [], nextCursor: null };
    }

    const invitationIds = page.map((row) => row.invitationId);
    const ownerIds = [...new Set(page.map((row) => row.ownerId))];
    const [payments, counts, emails] = await Promise.all([
      this.payments.latestFor(invitationIds),
      this.media.countsFor(invitationIds),
      this.owners.emailsFor(ownerIds),
    ]);

    return {
      items: page.map((row) => toSummary(row, payments, counts, emails)),
      nextCursor,
    };
  }
}

/**
 * One invitation's status detail (M9 T2; S1): everything the page shows plus the pinned package and template version
 * and the newest payments. Null for an id no row has, which the route answers as the one 404. Like the page it reads
 * each facet once, and it never reads invitation content, the owner's display name, guests, or RSVP answers.
 */
export class GetAdminInvitationUseCase {
  constructor(
    private readonly invitations: AdminInvitationRepository,
    private readonly payments: InvitationPaymentReader,
    private readonly media: InvitationMediaCountReader,
    private readonly owners: InvitationOwnerEmailReader,
  ) {}

  async execute(invitationId: string): Promise<AdminInvitationDetail | null> {
    const row = await this.invitations.findForAdmin(invitationId);
    if (row === null) {
      return null;
    }

    const [payments, counts, emails] = await Promise.all([
      this.payments.listForInvitation(invitationId, ADMIN_INVITATION_DETAIL_PAYMENT_LIMIT),
      this.media.countsFor([invitationId]),
      this.owners.emailsFor([row.ownerId]),
    ]);

    return {
      ...toSummary(row, new Map(), counts, emails),
      // The newest payment of the bounded list is the same one the summary's `latestPayment` states.
      latestPayment: payments[0] ?? null,
      ownerId: row.ownerId,
      packageId: row.packageId,
      templateVersionId: row.templateVersionId,
      payments,
    };
  }
}

/** One administrator's unpublish request: which invitation, who asked, and why (T8; S4, S6). */
export interface AdminUnpublishCommand {
  invitationId: string;
  /** The signed-in administrator's own id, never a client-supplied actor (S6). */
  adminUserId: string;
  reason: AdminActionReason;
  /** The optional note, as the administrator sent it; the audit domain trims it and enforces its bound. */
  note: string | null;
}

/**
 * An administrator unpublishes one invitation, by abuse report or at the owner's request (T8; S4, S6, L9). The change
 * and its audit row are one transaction in the repository, so the invitation is never a draft without a record of who
 * made it one. The answer is the same detail the read route serves, so the page renders the new state from the API's
 * own answer instead of guessing it.
 *
 * Null means no invitation has this id; the refusals of an invitation that is not published come from the port
 * unchanged, so presentation can answer its own conflict codes.
 */
export class UnpublishAdminInvitationUseCase {
  constructor(
    private readonly invitations: AdminInvitationRepository,
    private readonly detail: GetAdminInvitationUseCase,
  ) {}

  async execute(command: AdminUnpublishCommand): Promise<AdminInvitationDetail | null> {
    const unpublished = await this.invitations.unpublishForAdmin(command.invitationId, {
      adminUserId: command.adminUserId,
      reason: command.reason,
      note: command.note,
    });

    if (unpublished === null) {
      return null;
    }

    // The write read the row back; the detail read then answers the facets the page shows (payments, photos, owner).
    return this.detail.execute(unpublished.invitationId);
  }
}
