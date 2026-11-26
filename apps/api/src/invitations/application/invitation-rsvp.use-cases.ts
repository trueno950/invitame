import { isInvitationExpired } from "../domain/invitation-expiration";
import { assertEditable } from "../domain/invitation-lifecycle";
import {
  isRsvpOpenOn,
  type RsvpCompanion,
  type RsvpSettings,
  rsvpModeOf,
  validateRsvpResponse,
  validateRsvpSettings,
} from "../domain/invitation-rsvp";
import { isValidInvitationSlug } from "../domain/invitation-slug";
import type { InvitationRepository } from "./invitation.repository";
import type { InvitationCatalog } from "./invitation-catalog";
import {
  InvalidRsvpResponseError,
  InvalidRsvpSettingsError,
  RsvpNotOpenError,
  RsvpRateLimitedError,
} from "./invitation-rsvp.errors";
import type { RsvpReadModel, RsvpRepository } from "./rsvp.repository";
import type { RsvpRateLimiter } from "./rsvp-rate-limiter";
import {
  INITIAL_OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "../../settings/application/operational-settings";

// The RSVP use cases (M6 G1; S1, S3, S4). Two are the creator's: saving the deadline and the party limit, and
// reading the settings with every response and the totals that page shows. One is the guest's: submitting an open
// response to a published invitation. Nothing here logs, and nothing here exposes one guest's data to another: the
// public submission answers at most "not found", "not open", "rate limited", or the issues of a refused payload.
//
// The order of the guest's use case is deliberate:
// 1. the slug format, so a malformed value never reaches a query;
// 2. `findPublishedBySlug`, which answers only a PUBLISHED row, so a draft, an archived, and an unknown slug are one
//    invisible case (the same 404 the public page answers); an expired row is answered, because it stays visible
//    read-only (S2);
// 3. the package gate, the expiry, and the deadline, so an invitation that does not accept answers is refused before
//    any count or write — this is the 409 `RSVP_NOT_OPEN` of a visible invitation whose RSVP closed (S2, S4);
// 4. the rate limit, which bounds every remaining step;
// 5. the honeypot, before any validation: a filled field answers exactly like a stored response, so a bot learns
//    nothing from a 400 it would otherwise provoke;
// 6. the domain validation against the invitation's party limit;
// 7. the dedupe upsert, whose statement repeats the publication, expiry, and deadline rules so a concurrent unpublish,
//    an elapsed deadline, or an expiry that just passed is refused by the database too.

/** The totals of one invitation's answers (S1, S4, F3): confirmed people, declines, and rows. */
export interface RsvpTotals {
  /** The sum of the party sizes of the attending responses. */
  attendingPeople: number;
  /**
   * The adults among the attending people (F3; L6.4): the guest plus every companion not marked as a child. An answer
   * stored before the companions existed counts its whole party as adults, so the two totals always add up.
   */
  attendingAdults: number;
  /** The attending people whose companion entry marks them as a child (F3; L6.4). */
  attendingChildren: number;
  /** How many responses declined. */
  declinedCount: number;
  /** How many rows the invitation has, attending and declined together. */
  responses: number;
}

/** What the creator's read returns: the settings, the responses newest first, and the totals of the page. */
export interface RsvpRead extends RsvpReadModel {
  totals: RsvpTotals;
}

/** The values of a settings save; the owner comes from the session, never from the request payload (S9). */
export interface UpdateRsvpSettingsInput {
  ownerId: string;
  id: string;
  deadline: unknown;
  partyLimit: unknown;
}

/** The values of one guest submission; every value is untrusted, and the address comes from the request. */
export interface SubmitPublicRsvpInput {
  slug: string;
  name: unknown;
  attending: unknown;
  partySize: unknown;
  /** The people who come with the guest (F3; L6.1); omitted by a client written before the field existed. */
  companions?: unknown;
  /** The dietary restrictions of the party, or null (F3; L6.1). */
  dietaryNotes?: unknown;
  phone: unknown;
  message: unknown;
  honeypot: unknown;
  clientAddress: string;
}

const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name a stored row; a bad id would make PostgreSQL refuse the cast, so it answers first. */
function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && INVITATION_ID.test(value);
}

/**
 * The totals of one invitation's responses (S4, F3): confirmed people, the adults and the children among them,
 * declines, and rows. The party size stays the source of the count, so the children are the companion entries marked
 * as one and the adults are the rest of the party; an answer stored before the companions existed counts entirely as
 * adults, which keeps `attendingAdults + attendingChildren === attendingPeople` for every read.
 */
export function rsvpTotalsOf(
  responses: readonly {
    attending: boolean;
    partySize: number;
    companions?: readonly RsvpCompanion[] | null;
  }[],
): RsvpTotals {
  let attendingPeople = 0;
  let attendingChildren = 0;
  let declinedCount = 0;

  for (const response of responses) {
    if (response.attending) {
      attendingPeople += response.partySize;
      attendingChildren += (response.companions ?? []).filter(
        (companion) => companion.child,
      ).length;
    } else {
      declinedCount += 1;
    }
  }
  return {
    attendingPeople,
    attendingAdults: attendingPeople - attendingChildren,
    attendingChildren,
    declinedCount,
    responses: responses.length,
  };
}

/**
 * Saves the RSVP settings of a DRAFT or a PUBLISHED invitation (S4): the optional deadline and the party limit.
 * Only the owner may write: another customer's id, an unknown id, and a malformed id all answer null and change
 * nothing (A4). An archived invitation is refused (`InvitationNotEditableError`) before its request values are
 * looked at, exactly like a content or features save (A2, S7). The domain validates both values and reports every
 * issue at once; a refused request stores neither.
 */
export class UpdateRsvpSettingsUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly rsvp: RsvpRepository,
    // The platform-wide maximum party size (M9 T13; S5, S8), read at the moment the save is validated. A lowered
    // maximum refuses the next value above it and never rewrites a limit an invitation already stores: saving that
    // same stored number back stays possible, so an unrelated change (a new deadline) is never blocked by the panel.
    private readonly settings: OperationalSettingsReader = INITIAL_OPERATIONAL_SETTINGS_READER,
  ) {}

  async execute(input: UpdateRsvpSettingsInput): Promise<RsvpSettings | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    // A read-only invitation is refused before its request values are even looked at (S7, A2).
    assertEditable(stored.status);

    const settings = await this.settings.current();
    const validation = validateRsvpSettings(
      { deadline: input.deadline, partyLimit: input.partyLimit },
      // The invitation's own stored limit is the one value above a lowered maximum this save may still carry, so an
      // administrator's change never makes an unrelated save impossible (S8 «Conservan lo que tienen»).
      { maxPartyLimit: settings.rsvpMaxPartyLimit, storedPartyLimit: stored.rsvpPartyLimit },
    );
    if (!validation.ok) {
      throw new InvalidRsvpSettingsError(validation.issues);
    }

    return this.rsvp.saveSettings(input.ownerId, input.id, validation.value);
  }
}

/**
 * The settings, every response newest first, and the totals, for one owned invitation (S1, S4). An archived
 * invitation stays readable: archiving is read-only, not erased (A2). Another owner's id, an unknown id, and a
 * malformed id answer null, so a foreign invitation is indistinguishable from a missing one (A4). The read is not
 * paginated in this milestone: the creator sees the whole list and exports the same order.
 */
export class GetRsvpResponsesUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly rsvp: RsvpRepository,
  ) {}

  async execute(ownerId: string, id: string): Promise<RsvpRead | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    const read = await this.rsvp.findResponses(ownerId, id);
    if (read === null) {
      return null;
    }
    return { ...read, totals: rsvpTotalsOf(read.responses) };
  }
}

/** The instant a submission is judged at; injectable so a test can observe the deadline exactly (S4). */
export type RsvpClock = () => Date;

/**
 * One guest's open RSVP submission (M6 G1; S1, S3, S4). The slug is the only input that names the invitation, so
 * the route needs no session; the guest's name, attendance, party size, phone, and message are validated against
 * the invitation's own party limit. A submission is counted against `RSVP_RATE_LIMIT` per invitation and client
 * address, and a filled honeypot answers exactly like a stored response without storing anything. A repeat from
 * the same normalized name and phone updates the passed response instead of duplicating it, so a retried request
 * is safe. Answers false only for the same invisible cases the public page answers with its 404; true means the
 * request got the success answer, whether it stored, updated, or was dropped by the honeypot.
 *
 * Throws `RsvpNotOpenError` when the invitation is visible but does not accept an open response,
 * `RsvpRateLimitedError` when this address is over the cap, and `InvalidRsvpResponseError` with the domain's issues
 * when the payload is refused. A refused submission stores nothing.
 */
export class SubmitPublicRsvpUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly rsvp: RsvpRepository,
    private readonly rateLimiter: RsvpRateLimiter,
    private readonly now: RsvpClock = () => new Date(),
    // The platform-wide maximum party size (M9 T13; S5, S8), read at the moment the response is validated. An
    // invitation whose stored limit the panel lowered keeps the party it allows, and the next larger response is
    // refused.
    private readonly settings: OperationalSettingsReader = INITIAL_OPERATIONAL_SETTINGS_READER,
  ) {}

  async execute(input: SubmitPublicRsvpInput): Promise<boolean> {
    if (!isValidInvitationSlug(input.slug)) {
      return false;
    }
    const published = await this.invitations.findPublishedBySlug(input.slug);
    if (published === null) {
      return false;
    }

    const includedFeatureKeys = await this.includedFeatureKeysOf(published.packageId);
    if (rsvpModeOf(includedFeatureKeys) !== "open") {
      throw new RsvpNotOpenError();
    }

    const at = this.now();
    // An expired invitation stays visible but read-only, so the RSVP is closed and not invisible (S2, T4). The check
    // comes before the rate limit, so a refused submission never spends the guest's budget.
    if (isInvitationExpired(published.expiresAt, at) || !isRsvpOpenOn(published.rsvpDeadline, at)) {
      throw new RsvpNotOpenError();
    }

    if (!(await this.rateLimiter.consume(published.id, input.clientAddress))) {
      throw new RsvpRateLimitedError();
    }

    // The honeypot is answered before validation and before the write: the caller cannot tell it apart.
    if (isFilled(input.honeypot)) {
      return true;
    }

    // The widest party is the invitation's own limit capped by the platform maximum: a guest may never submit more
    // people than the panel allows, even when the invitation stores a larger limit from before the change.
    const settings = await this.settings.current();
    const partyLimit = Math.min(published.rsvpPartyLimit, settings.rsvpMaxPartyLimit);
    const validation = validateRsvpResponse(
      {
        name: input.name,
        attending: input.attending,
        partySize: input.partySize,
        companions: input.companions,
        dietaryNotes: input.dietaryNotes,
        phone: input.phone,
        message: input.message,
      },
      { partyLimit },
    );
    if (!validation.ok) {
      throw new InvalidRsvpResponseError(validation.issues);
    }

    const written = await this.rsvp.upsertResponse(published.id, validation.value, at);
    if (!written) {
      // The invitation stopped accepting between the read and the write.
      throw new RsvpNotOpenError();
    }
    return true;
  }

  /**
   * The feature keys the pinned package includes right now, or none when the catalog cannot answer for it. A
   * missing package fails closed: no RSVP mode is offered, never one nobody verified (S4).
   */
  private async includedFeatureKeysOf(packageId: string): Promise<readonly string[]> {
    const entitlements = await this.catalog.findPackageEntitlements(packageId);
    return entitlements?.includedFeatureKeys ?? [];
  }
}

/**
 * Whether the honeypot holds anything at all. Any non-empty value counts as filled, whitespace included: a human
 * never types into a field the page hides, so even spaces are a bot's answer and the submission is dropped.
 */
function isFilled(honeypot: unknown): boolean {
  return typeof honeypot === "string" && honeypot !== "";
}
