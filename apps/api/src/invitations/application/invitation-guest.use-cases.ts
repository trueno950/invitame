import {
  GUEST_LIST_FEATURE_KEY,
  QR_PASS_FEATURE_KEY,
  rsvpModeOf,
} from "../domain/invitation-features";
import {
  type GuestTotals,
  guestTotalsOf,
  isGuestTokenFormat,
  validateGuestInput,
} from "../domain/invitation-guest";
import { assertEditable } from "../domain/invitation-lifecycle";
import { isRsvpOpenOn, validateRsvpResponse } from "../domain/invitation-rsvp";
import { isValidInvitationSlug } from "../domain/invitation-slug";
import type {
  GuestCheckIn,
  GuestListReadModel,
  GuestRepository,
  GuestWithResponse,
} from "./guest.repository";
import { guestTokenHash, mintGuestToken } from "./guest-token";
import type { InvitationRepository } from "./invitation.repository";
import { type GetPublicInvitationUseCase, includedFeatureKeysOf } from "./invitation.use-cases";
import type { InvitationCatalog } from "./invitation-catalog";
import {
  GuestListNotAvailableError,
  GuestNotConfirmedError,
  GuestNotFoundError,
  GuestSeatsBelowConfirmedPartyError,
  InvalidGuestError,
  QrPassNotAvailableError,
} from "./invitation-guest.errors";
import type { PublicInvitation } from "./invitation-public";
import {
  InvalidRsvpResponseError,
  RsvpNotOpenError,
  RsvpRateLimitedError,
} from "./invitation-rsvp.errors";
import type { RsvpRepository } from "./rsvp.repository";
import { toGuestCsv, toRsvpCsv } from "./rsvp-csv";
import type { RsvpRateLimiter } from "./rsvp-rate-limiter";

// The guest-list use cases (M6 G2; S1, S3, S4). Five are the creator's: reading the list with its totals, adding,
// editing, and removing a guest, replacing a guest's personal token, checking a guest in at the door, and exporting
// the list. Two are the guest's, without a session: reading one personal page and submitting that guest's answer.
//
// The order of every creator use case is the same, so the guards cannot be reordered by accident:
// 1. the id format, so a malformed value never reaches a query;
// 2. `findOwned`, so an id another customer has answers exactly like an id that names nothing (A4);
// 3. the archived refusal for a write, before the request values are looked at (A2);
// 4. the package gate, because a guest list belongs to a package that grants `GUEST_LIST` (S3, S4);
// 5. the domain validation, and last the guarded write, which repeats ownership and the editable status in its own
//    `WHERE`. Nothing here logs, and no creator response carries another owner's data.
//
// The guest's two use cases deliberately share the invitation read with the open RSVP form: `findPublishedBySlug`
// answers only a live PUBLISHED row, so a draft, an archived, an expired, and an unknown slug are one invisible
// case. A malformed or unknown personal token answers the same invisible case too, and a token of another
// invitation is not found because the lookup is scoped by the invitation id. The token itself is never stored: the
// application hashes it and every lookup is one probe of the unique hash index, so no secret is compared in code.

const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name a stored row; a bad id would make PostgreSQL refuse the cast, so it answers first. */
function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && INVITATION_ID.test(value);
}

/** The instant a guest operation is judged at; injectable so a test can observe the deadline exactly (S4). */
export type GuestClock = () => Date;

/** What the creator's guest read returns: the invitation's slug, the guests, and the totals of the page. */
export interface GuestListRead extends GuestListReadModel {
  totals: GuestTotals;
}

/** The values of one new guest; the owner comes from the session, never from the request payload (S9). */
export interface CreateGuestInput {
  ownerId: string;
  id: string;
  name: unknown;
  seats: unknown;
  phone: unknown;
  note: unknown;
}

/** The values of one guest edit; the owner comes from the session, never from the request payload (S9). */
export interface UpdateGuestInput extends CreateGuestInput {
  guestId: string;
}

/** A guest and the plain token minted for it: the only moment the plain value ever exists outside the link. */
export interface GuestWithToken {
  guest: GuestWithResponse;
  token: string;
}

/** One guest's answer, as their personal page shows it. Nothing about another guest is here. */
export interface PublicGuestAnswer {
  attending: boolean;
  partySize: number;
  message: string | null;
}

/** The guest of one personal link, as that guest's page shows them (S4). */
export interface PublicGuest {
  name: string;
  seats: number;
  /** The guest's own last answer, or null while they have not answered. */
  response: PublicGuestAnswer | null;
  /** Whether this page shows the access QR: the package grants `QR_PASS` and this guest confirmed. */
  qrPass: boolean;
}

/** The personal page of one guest: the published invitation's public read plus that guest's own block (S4). */
export interface PublicGuestInvitation {
  page: PublicInvitation;
  guest: PublicGuest;
}

/** The values of one guest submission from a personal link; every value is untrusted. */
export interface SubmitGuestRsvpInput {
  slug: string;
  token: string;
  attending: unknown;
  partySize: unknown;
  message: unknown;
}

/** The values of one check-in scan; the token arrives from the QR URL, and the owner from the session. */
export interface CheckInGuestInput {
  ownerId: string;
  id: string;
  token: string;
}

/** The creator's CSV export of one invitation: the attachment filename and the text. */
export interface AttendanceExport {
  filename: string;
  body: string;
}

/** The one 409 of a guest list the pinned package does not grant (S3, S4). */
async function requireGuestList(
  catalog: InvitationCatalog,
  packageId: string,
): Promise<readonly string[]> {
  const includedFeatureKeys = await includedFeatureKeysOf(catalog, packageId);
  if (!includedFeatureKeys.includes(GUEST_LIST_FEATURE_KEY)) {
    throw new GuestListNotAvailableError();
  }
  return includedFeatureKeys;
}

/**
 * The guest list of one owned invitation with its totals (S1, S4): guests, seats, confirmed people, declines,
 * pending guests, and check-ins. An archived invitation stays readable (A2); another customer's id and an unknown
 * id answer null (A4); a package that does not grant `GUEST_LIST` is refused with `GuestListNotAvailableError`, so
 * an invitation without the feature never shows an empty list that looks like a real one.
 */
export class ListGuestsUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
  ) {}

  async execute(ownerId: string, id: string): Promise<GuestListRead | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    await requireGuestList(this.catalog, stored.packageId);

    const read = await this.guests.findGuests(ownerId, id);
    if (read === null) {
      return null;
    }
    return { ...read, totals: guestTotalsOf(read.guests) };
  }
}

/**
 * Adds one guest to a DRAFT or a PUBLISHED invitation (S4). The name, seats, phone, and note are validated by the
 * domain, then a 128-bit token is minted and only its digest is stored; the plain token travels back once, so the
 * creator can share the personal link. An archived invitation is refused before the request values are looked at,
 * a package without `GUEST_LIST` is refused, and a refused guest stores nothing.
 */
export class CreateGuestUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
    private readonly now: GuestClock = () => new Date(),
  ) {}

  async execute(input: CreateGuestInput): Promise<GuestWithToken | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);
    await requireGuestList(this.catalog, stored.packageId);

    const validation = validateGuestInput({
      name: input.name,
      seats: input.seats,
      phone: input.phone,
      note: input.note,
    });
    if (!validation.ok) {
      throw new InvalidGuestError(validation.issues);
    }

    const token = mintGuestToken();
    const guest = await this.guests.create(
      input.ownerId,
      input.id,
      { ...validation.value, tokenHash: guestTokenHash(token) },
      this.now(),
    );

    return guest === null ? null : { guest: { ...guest, response: null }, token };
  }
}

/**
 * Replaces the name, seats, phone, and note of one guest (S4). The personal token and the check-in state are not
 * editable here: the token has its own rotation use case, and a check-in is a fact of the door. The domain
 * validates every field, and the write repeats ownership and the editable status. A missing or foreign invitation
 * answers null, so the route keeps the invitation 404 (A4); a guest that is not part of this owner's invitation
 * answers `GuestNotFoundError`, its own 404. Lowering the seats below a party the guest already confirmed is refused
 * with `GuestSeatsBelowConfirmedPartyError`, so a stored answer never names more people than the seats allow.
 */
export class UpdateGuestUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
    private readonly now: GuestClock = () => new Date(),
  ) {}

  async execute(input: UpdateGuestInput): Promise<GuestWithResponse | null> {
    if (!isInvitationId(input.id) || !isInvitationId(input.guestId)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);
    await requireGuestList(this.catalog, stored.packageId);

    const validation = validateGuestInput({
      name: input.name,
      seats: input.seats,
      phone: input.phone,
      note: input.note,
    });
    if (!validation.ok) {
      throw new InvalidGuestError(validation.issues);
    }

    const updated = await this.guests.update(
      input.ownerId,
      input.id,
      input.guestId,
      validation.value,
      this.now(),
    );
    if (updated === null) {
      // The write missed: either the guest is not part of this invitation, or the seats could not hold its answer.
      const current = await this.guests.findGuest(input.ownerId, input.id, input.guestId);
      if (current === null) {
        throw new GuestNotFoundError();
      }
      if (
        current.response?.attending === true &&
        current.response.partySize > validation.value.seats
      ) {
        throw new GuestSeatsBelowConfirmedPartyError(current.response.partySize);
      }
      throw new GuestNotFoundError();
    }

    // The answer, when the guest already gave one, is read once so the response shape stays constant.
    return this.guests.findGuest(input.ownerId, input.id, input.guestId);
  }
}

/**
 * Removes one guest and their answer (S4). The decision is to delete the answer with the guest, in one statement:
 * a response exists for a guest, so keeping it after the creator removed the guest would retain personal data for a
 * person the owner no longer lists and would leave a row nobody can reconcile. Nothing else of the invitation is
 * touched. An archived invitation is refused, a package without `GUEST_LIST` is refused, a missing or foreign
 * invitation answers false (the invitation 404, A4), and a guest that is not part of this invitation answers
 * `GuestNotFoundError`.
 */
export class DeleteGuestUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
  ) {}

  async execute(ownerId: string, id: string, guestId: string): Promise<boolean> {
    if (!isInvitationId(id) || !isInvitationId(guestId)) {
      return false;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return false;
    }
    assertEditable(stored.status);
    await requireGuestList(this.catalog, stored.packageId);

    if (!(await this.guests.remove(ownerId, id, guestId))) {
      throw new GuestNotFoundError();
    }
    return true;
  }
}

/**
 * Replaces one guest's personal token (S4): the new 128-bit value is returned once, only its digest is stored, and
 * the previous link stops resolving at the same instant. The rotation exists so a creator can revoke a link that
 * leaked or was sent to the wrong person; the check-in state and the answer are untouched. A missing or foreign
 * invitation answers null (the invitation 404, A4); a guest that is not part of it answers `GuestNotFoundError`.
 */
export class RotateGuestTokenUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
    private readonly now: GuestClock = () => new Date(),
  ) {}

  async execute(ownerId: string, id: string, guestId: string): Promise<GuestWithToken | null> {
    if (!isInvitationId(id) || !isInvitationId(guestId)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);
    await requireGuestList(this.catalog, stored.packageId);

    const token = mintGuestToken();
    const rotated = await this.guests.rotateToken(
      ownerId,
      id,
      guestId,
      guestTokenHash(token),
      this.now(),
    );
    if (rotated === null) {
      throw new GuestNotFoundError();
    }

    // The answer and the check-in state are untouched by a rotation; they travel back with the guest.
    const guest = await this.guests.findGuest(ownerId, id, guestId);
    return guest === null ? null : { guest, token };
  }
}

/**
 * One guest's personal page (S4): the published invitation's public read plus that guest's own name, seats, last
 * answer, and whether the access QR is offered. Every invisible case answers null, which the route maps to the same
 * 404 the public page answers: a malformed slug, a draft, an archived, an expired, or an unknown slug, a malformed
 * token, an unknown or revoked token, and a token of another invitation. Nothing about another guest is read, and
 * the page is the same allow-listed projection a guest without a link receives.
 */
export class GetPublicGuestUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly guests: GuestRepository,
    private readonly publicInvitations: GetPublicInvitationUseCase,
  ) {}

  async execute(slug: string, token: string): Promise<PublicGuestInvitation | null> {
    if (!isValidInvitationSlug(slug) || !isGuestTokenFormat(token)) {
      return null;
    }
    const published = await this.invitations.findPublishedBySlug(slug);
    if (published === null) {
      return null;
    }
    const guest = await this.guests.findByToken(published.id, guestTokenHash(token));
    if (guest === null) {
      return null;
    }

    const page = await this.publicInvitations.project(published);
    const response = guest.response;

    return {
      page,
      guest: {
        name: guest.name,
        seats: guest.seats,
        response:
          response === null
            ? null
            : {
                attending: response.attending,
                partySize: response.partySize,
                message: response.message,
              },
        // The pass belongs to a confirmed guest of a package that grants the QR (S3, S4).
        qrPass: page.features.rsvp.qrPass && response?.attending === true,
      },
    };
  }
}

/**
 * One guest's answer through their personal link (S4). The slug and the token are the only inputs that name the
 * invitation and the guest, so the route needs no session. The invitation must be published and inside its
 * deadline (409 `RSVP_NOT_OPEN` otherwise), its package must grant the guest list, and the token must name a guest of
 * that invitation (the same invisible 404 as an unknown slug otherwise). The answer is validated against the
 * guest's own seats — never the invitation's party limit — and every submission is counted per guest on the shared
 * rate-limit store, so one guest cannot fill the list and one address cannot spend another guest's budget. The write
 * repeats publication and deadline in its own statement, so a retry is idempotent and a race is refused there too.
 *
 * Answers false only for the invisible cases the public page answers with its 404; true means the answer was
 * stored, whether it was the guest's first or a change of mind.
 */
export class SubmitGuestRsvpUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
    private readonly rateLimiter: RsvpRateLimiter,
    private readonly now: GuestClock = () => new Date(),
  ) {}

  async execute(input: SubmitGuestRsvpInput): Promise<boolean> {
    if (!isValidInvitationSlug(input.slug) || !isGuestTokenFormat(input.token)) {
      return false;
    }
    const published = await this.invitations.findPublishedBySlug(input.slug);
    if (published === null) {
      return false;
    }

    const includedFeatureKeys = await includedFeatureKeysOf(this.catalog, published.packageId);
    if (rsvpModeOf(includedFeatureKeys) !== "guest-list") {
      throw new RsvpNotOpenError();
    }

    const at = this.now();
    if (!isRsvpOpenOn(published.rsvpDeadline, at)) {
      throw new RsvpNotOpenError();
    }

    const tokenHash = guestTokenHash(input.token);
    const guest = await this.guests.findByToken(published.id, tokenHash);
    if (guest === null) {
      return false;
    }

    if (!(await this.rateLimiter.consume(published.id, guest.id))) {
      throw new RsvpRateLimitedError();
    }

    const validation = validateRsvpResponse(
      {
        name: guest.name,
        attending: input.attending,
        partySize: input.partySize,
        phone: guest.phone,
        message: input.message,
      },
      // A guest may bring at most the seats the owner gave them (S4), not the invitation's open-form limit.
      { partyLimit: guest.seats },
    );
    if (!validation.ok) {
      throw new InvalidRsvpResponseError(validation.issues);
    }

    const written = await this.guests.upsertResponse(
      published.id,
      guest.id,
      {
        attending: validation.value.attending,
        partySize: validation.value.partySize,
        message: validation.value.message,
      },
      at,
    );
    if (!written) {
      // The invitation stopped accepting between the read and the write.
      throw new RsvpNotOpenError();
    }
    return true;
  }
}

/**
 * The owner's check-in of one guest (S4). The token arrives from the QR URL the guest shows at the door, so the
 * route is the creator's and only the creator may reach it. The invitation must be owned, not archived, and its
 * package must grant `QR_PASS`; the token must name a guest of that invitation who confirmed attendance. The first
 * check-in instant is kept, so showing the same QR twice is idempotent, and the answer names the guest, the seats,
 * the confirmed party, and that instant — nothing about any other guest.
 *
 * A malformed or unknown token, or one of another invitation, answers `GuestNotFoundError` (the guest 404); a guest
 * who has not confirmed is refused with `GuestNotConfirmedError` (409). A missing or foreign invitation answers null,
 * so the route keeps the invitation 404 of every owner route (A4). The write itself is one statement that requires
 * the ownership, the status, the token, and the attending answer, so a race cannot check in a guest who just
 * withdrew.
 */
export class CheckInGuestUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
    private readonly now: GuestClock = () => new Date(),
  ) {}

  async execute(input: CheckInGuestInput): Promise<GuestCheckIn | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);

    const includedFeatureKeys = await includedFeatureKeysOf(this.catalog, stored.packageId);
    if (!includedFeatureKeys.includes(QR_PASS_FEATURE_KEY)) {
      throw new QrPassNotAvailableError();
    }
    if (!isGuestTokenFormat(input.token)) {
      // The invitation is this owner's and grants the pass, so a value that cannot be a token is a guest miss.
      throw new GuestNotFoundError();
    }

    const tokenHash = guestTokenHash(input.token);
    const checkedIn = await this.guests.checkIn(input.ownerId, input.id, tokenHash, this.now());
    if (checkedIn !== null) {
      return checkedIn;
    }

    // The write matched nothing. A guest of this invitation who has not confirmed gets the precise refusal; a
    // token that names no guest of it answers the guest 404. Nothing was changed either way.
    const guest = await this.guests.findByToken(input.id, tokenHash);
    if (guest === null) {
      throw new GuestNotFoundError();
    }
    throw new GuestNotConfirmedError();
  }
}

/**
 * The creator's attendance export (M6 G1, G2; S1, S4). In guest-list mode it is the guest list, pending guests
 * included, because that is the file the door needs; otherwise it is the open form's responses, unchanged. The
 * filename carries the slug, which is already a safe filename, and the body is spreadsheet-safe either way.
 */
export class GetAttendanceExportUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly guests: GuestRepository,
    private readonly rsvp: RsvpRepository,
  ) {}

  async execute(ownerId: string, id: string): Promise<AttendanceExport | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }

    const includedFeatureKeys = await includedFeatureKeysOf(this.catalog, stored.packageId);
    if (rsvpModeOf(includedFeatureKeys) === "guest-list") {
      const guests = await this.guests.findGuests(ownerId, id);
      if (guests === null) {
        return null;
      }
      return { filename: `asistencia-${guests.slug}.csv`, body: toGuestCsv(guests.guests) };
    }

    const responses = await this.rsvp.findResponses(ownerId, id);
    if (responses === null) {
      return null;
    }
    return { filename: `asistencia-${responses.slug}.csv`, body: toRsvpCsv(responses.responses) };
  }
}
