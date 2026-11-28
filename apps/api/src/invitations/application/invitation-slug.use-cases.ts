import { assertEditable } from "../domain/invitation-lifecycle";
import {
  MAX_INVITATION_SLUG_RENAMES,
  ownerSlugChoice,
  ownerSlugIssue,
  type OwnerSlugChoice,
} from "../domain/invitation-slug";
import { ReservedInvitationSlugError } from "../domain/invitation.errors";
import {
  InvalidInvitationSlugError,
  SlugAvailabilityRateLimitedError,
} from "./invitation.application.errors";
import type { InvitationCatalog } from "./invitation-catalog";
import type { InvitationRepository } from "./invitation.repository";
import { type OwnedInvitation, toOwnedInvitation } from "./invitation.use-cases";
import type { ReminderSender } from "../../reminders/application/reminder-sender";
import type { SlugAvailabilityRateLimiter } from "./slug-availability-rate-limiter";

// The custom invitation address (F11; S2.11, L15.1, L15.3). Two owner-only commands, both answering the same
// vocabulary the editor shows:
//
// - `CheckInvitationSlugAvailabilityUseCase` answers whether the typed address may be saved — `available`, `taken`,
//   `invalid`, or `reserved` — and never names another owner, another invitation, or what they hold. It counts one
//   check against the owner's own limit and answers a malformed address before anything is looked up.
// - `RenameInvitationSlugUseCase` saves it: the domain rule first, then the repository's one transaction, which stores
//   the previous address as an alias so an already shared link keeps working, refuses an archived invitation, and
//   refuses the sixth rename with its own error (L15.2).
//
// Neither command reads another owner's row: the invitation is resolved by `findOwned`, so a foreign id answers
// exactly like an unknown one (A4).

const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && INVITATION_ID.test(value);
}

/** What one availability check may answer (F11; L15.3): never who holds a taken address. */
export type SlugAvailability = "available" | "taken" | "invalid" | "reserved";

export interface SlugAvailabilityAnswer {
  /** The address the check is about, echoed so the editor matches an answer to the text it asked with. */
  slug: string;
  status: SlugAvailability;
}

export interface CheckSlugAvailabilityInput {
  ownerId: string;
  id: string;
  slug: unknown;
}

export interface RenameSlugInput {
  ownerId: string;
  id: string;
  slug: unknown;
}

/** The text an answer echoes: the typed address itself, or an empty string when it is not text at all. */
function echoedSlug(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Answers whether the owner may save the typed address (F11; S2.11, L15.3). Null when no invitation of this owner has
 * this id (A4); `SlugAvailabilityRateLimitedError` when the owner is over the check limit; otherwise the one word the
 * editor renders. The rule is the domain's, and the one lookup it makes is scoped to this owner's own invitation, so a
 * taken address says nothing about who holds it.
 */
export class CheckInvitationSlugAvailabilityUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly rateLimiter: SlugAvailabilityRateLimiter = { consume: async () => true },
  ) {}

  async execute(input: CheckSlugAvailabilityInput): Promise<SlugAvailabilityAnswer | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }

    const slug = echoedSlug(input.slug);
    const choice: OwnerSlugChoice = ownerSlugChoice(slug);

    if (choice !== "valid") {
      return { slug, status: choice };
    }

    // Only a check that has to look something up spends the owner's limit: a malformed or reserved address is
    // answered by the rule itself, so typing it costs nothing (L15.3).
    if (!(await this.rateLimiter.consume(input.ownerId))) {
      throw new SlugAvailabilityRateLimitedError();
    }

    // The owner's own current address is available: saving it changes nothing and stores no alias.
    const taken = slug !== stored.slug && (await this.invitations.isSlugInUse(slug, stored.id));

    return { slug, status: taken ? "taken" : "available" };
  }
}

/**
 * Renames the public address of a DRAFT or a PUBLISHED invitation (F11; S2.11, L15.2, L15.3). A published invitation
 * changes live, and every previous address keeps resolving through a permanent redirect because the repository stores
 * it as an alias in the same transaction. An archived invitation is refused before the address is read (A2, S7); a
 * foreign id answers null (A4); an address the rule refuses throws `InvalidInvitationSlugError` or
 * `ReservedInvitationSlugError`; an address another invitation holds (or a previous address of any invitation)
 * throws `InvitationSlugTakenError`; the sixth rename throws `InvitationSlugRenameLimitError`.
 */
export class RenameInvitationSlugUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly reminders?: ReminderSender,
  ) {}

  async execute(input: RenameSlugInput): Promise<OwnedInvitation | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);

    const choice = ownerSlugChoice(input.slug);
    if (choice === "reserved") {
      throw new ReservedInvitationSlugError(String(input.slug));
    }
    const issue = ownerSlugIssue(input.slug);
    if (issue !== null) {
      throw new InvalidInvitationSlugError([issue]);
    }
    const slug = input.slug as string;

    if (slug === stored.slug) {
      // Nothing moves, so no alias is stored and no rename is spent: the answer is the invitation as it stands.
      return this.owned(stored);
    }

    const renamed = await this.invitations.renameSlug(input.ownerId, input.id, slug);

    return renamed === null ? null : this.owned(renamed);
  }

  /** The owner's view of the row the rename answered, with the schema and the gated features it already had. */
  private async owned(stored: Parameters<typeof toOwnedInvitation>[0]): Promise<OwnedInvitation> {
    const [snapshot, entitlements, renames] = await Promise.all([
      this.catalog.findVersionSchema(stored.templateVersionId),
      this.catalog.findPackageEntitlements(stored.packageId),
      this.invitations.countSlugAliases(stored.id),
    ]);

    return toOwnedInvitation(
      stored,
      snapshot?.schema ?? null,
      entitlements?.includedFeatureKeys ?? [],
      this.reminders?.isConfigured() ?? false,
      Math.max(0, MAX_INVITATION_SLUG_RENAMES - renames),
    );
  }
}
