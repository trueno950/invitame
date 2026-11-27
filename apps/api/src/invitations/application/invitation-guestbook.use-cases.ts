import { isInvitationExpired } from "../domain/invitation-expiration";
import { type GuestbookEntryRecord, validateGuestbookEntry } from "../domain/invitation-guestbook";
import { GUESTBOOK_FEATURE_KEY } from "../domain/invitation-features";
import { isValidInvitationSlug } from "../domain/invitation-slug";
import type { GuestbookRepository } from "./guestbook.repository";
import type { GuestbookRateLimiter } from "./guestbook-rate-limiter";
import type { InvitationCatalog } from "./invitation-catalog";
import {
  GuestbookClosedError,
  GuestbookRateLimitedError,
  InvalidGuestbookEntryError,
} from "./invitation-guestbook.errors";
import type { InvitationRepository } from "./invitation.repository";

// The guestbook use cases (F7; S2.7, L10.3, L10.6). One is the guest's: signing a published invitation's wall without a
// session. Two are the owner's: reading every entry with its state, and hiding or showing one again. Nothing here
// logs, and nothing here exposes one guest's entry to another beyond the wall itself, which is public by design.
//
// The order of the guest's use case mirrors the open RSVP, deliberately:
// 1. the slug format, so a malformed value never reaches a query;
// 2. `findPublishedBySlug`, which answers only a live PUBLISHED row, so a draft, an archived, and an unknown slug are
//    one invisible case (the 404 the public page answers);
// 3. the package gate and the expiry, so an invitation whose wall is closed is refused before any count or write;
// 4. the rate limit, which bounds every remaining step;
// 5. the honeypot, before any validation: a filled field answers exactly like a stored signature, so a bot learns
//    nothing from a 400 it would otherwise provoke;
// 6. the domain validation;
// 7. the insert, whose statement repeats the publication and expiry rules so a concurrent unpublish or an expiry that
//    just passed is refused by the database too.

/** The values of one signature; every value is untrusted and the address comes from the request. */
export interface SubmitPublicGuestbookEntryInput {
  readonly slug: string;
  readonly authorName: unknown;
  readonly message: unknown;
  readonly honeypot: unknown;
  readonly clientAddress: string;
}

/** The owner's moderation read of one invitation (L10.6): every entry, and how many are visible and hidden. */
export interface GuestbookRead {
  readonly entries: GuestbookEntryRecord[];
  readonly visibleCount: number;
  readonly hiddenCount: number;
}

/** The values of one moderation write; the owner comes from the session, never from the request payload (S9). */
export interface SetGuestbookEntryHiddenInput {
  readonly ownerId: string;
  readonly id: string;
  readonly entryId: string;
  readonly hidden: boolean;
}

/**
 * The outcome of one moderation write: the stored entry, an invitation that is missing or another customer's (A4), or
 * an entry id that names nothing of this invitation.
 */
export type SetGuestbookEntryHiddenResult =
  | { readonly status: "ok"; readonly entry: GuestbookEntryRecord }
  | { readonly status: "invitation-not-found" }
  | { readonly status: "entry-not-found" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name a stored row; a bad id would make PostgreSQL refuse the cast, so it answers first. */
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The instant a signature is judged at; injectable so a test can observe an expiry exactly (S2). */
export type GuestbookClock = () => Date;

/**
 * One guest's signature on a published invitation's wall (F7; S2.7, L10.3). The slug is the only input that names the
 * invitation, so the route needs no session. The signature is counted against `GUESTBOOK_RATE_LIMIT` per invitation and
 * client address, and a filled honeypot answers exactly like a stored one without storing anything. Answers false only
 * for the invisible cases the public page answers with its 404; true means the request got the success answer, whether
 * it stored or was dropped by the honeypot.
 *
 * Throws `GuestbookClosedError` when the invitation is visible but its wall takes no signature — the package does not
 * grant `GUESTBOOK`, the invitation expired, or it stopped being published during the write — and
 * `GuestbookRateLimitedError` when this address is over the cap, and `InvalidGuestbookEntryError` with the domain's
 * issues when the signature is refused. A refused signature stores nothing.
 */
export class SubmitPublicGuestbookEntryUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guestbook: GuestbookRepository,
    private readonly rateLimiter: GuestbookRateLimiter,
    private readonly now: GuestbookClock = () => new Date(),
  ) {}

  async execute(input: SubmitPublicGuestbookEntryInput): Promise<boolean> {
    if (!isValidInvitationSlug(input.slug)) {
      return false;
    }
    const published = await this.invitations.findPublishedBySlug(input.slug);
    if (published === null) {
      return false;
    }

    const includedFeatureKeys = await this.includedFeatureKeysOf(published.packageId);
    if (!includedFeatureKeys.includes(GUESTBOOK_FEATURE_KEY)) {
      throw new GuestbookClosedError();
    }

    const at = this.now();
    // An expired invitation stays visible read-only, so its wall is closed rather than missing (S2). The check comes
    // before the rate limit, so a refused signature never spends the guest's budget.
    if (isInvitationExpired(published.expiresAt, at)) {
      throw new GuestbookClosedError();
    }

    if (!(await this.rateLimiter.consume(published.id, input.clientAddress))) {
      throw new GuestbookRateLimitedError();
    }

    // The honeypot is answered before validation and before the write: the caller cannot tell it apart.
    if (isFilled(input.honeypot)) {
      return true;
    }

    const validation = validateGuestbookEntry({
      authorName: input.authorName,
      message: input.message,
    });
    if (!validation.ok) {
      throw new InvalidGuestbookEntryError(validation.issues);
    }

    const written = await this.guestbook.insert(published.id, validation.value, at);
    if (!written) {
      // The invitation stopped accepting between the read and the write.
      throw new GuestbookClosedError();
    }
    return true;
  }

  /**
   * The feature keys the pinned package includes right now, or none when the catalog cannot answer for it. A missing
   * package fails closed: no wall is offered, never one nobody verified (S4).
   */
  private async includedFeatureKeysOf(packageId: string): Promise<readonly string[]> {
    const entitlements = await this.catalog.findPackageEntitlements(packageId);

    return entitlements?.includedFeatureKeys ?? [];
  }
}

/**
 * Every entry of one owned invitation, visible and hidden together, with the two counts the moderation screen's tabs
 * show (L10.6). Only the owner reads it: another customer's id, an unknown id, and a malformed id answer null, so a
 * foreign invitation is indistinguishable from a missing one (A4). An archived invitation stays readable: archiving is
 * read-only, not erased, and the owner may still hide what they no longer want shown.
 */
export class GetGuestbookEntriesUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly guestbook: GuestbookRepository,
  ) {}

  async execute(ownerId: string, id: string): Promise<GuestbookRead | null> {
    if (!isUuid(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    const entries = await this.guestbook.findOwnedEntries(ownerId, id);
    if (entries === null) {
      return null;
    }
    const hiddenCount = entries.filter((entry) => entry.hidden).length;

    return { entries, visibleCount: entries.length - hiddenCount, hiddenCount };
  }
}

/**
 * Hides one entry, or shows it again (F7; L10.6): the owner's only moderation. Nothing is deleted — the guest never
 * deletes, and the owner does not either — so the same write can always be reversed. Owner-only: another customer's
 * invitation answers `invitation-not-found`, and an entry that belongs to another invitation answers `entry-not-found`,
 * which is the same 404 a missing one answers (A4).
 */
export class SetGuestbookEntryHiddenUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly guestbook: GuestbookRepository,
  ) {}

  async execute(input: SetGuestbookEntryHiddenInput): Promise<SetGuestbookEntryHiddenResult> {
    if (!isUuid(input.id) || !isUuid(input.entryId)) {
      return { status: "invitation-not-found" };
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return { status: "invitation-not-found" };
    }
    const entry = await this.guestbook.setHidden(
      input.ownerId,
      input.id,
      input.entryId,
      input.hidden,
    );

    return entry === null ? { status: "entry-not-found" } : { status: "ok", entry };
  }
}

/**
 * Whether the honeypot holds anything at all. Any non-empty value counts as filled, whitespace included: a human never
 * types into a field the page hides, so even spaces are a bot's answer and the signature is dropped.
 */
function isFilled(honeypot: unknown): boolean {
  return typeof honeypot === "string" && honeypot !== "";
}
