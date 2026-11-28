import { PASSWORD_PROTECTION_FEATURE_KEY } from "../domain/invitation-features";
import { validateInvitationPassword } from "../domain/invitation-password";
import type { InvitationCatalog } from "./invitation-catalog";
import { hashInvitationPassword } from "./invitation-password";
import {
  InvalidInvitationPasswordError,
  InvitationPasswordNotAvailableError,
} from "./invitation-password.errors";
import type { InvitationPasswordState, InvitationRepository } from "./invitation.repository";

// The owner's two writes on the shared access code of one invitation (F13; S2.13, L18.1, L18.5). Both are owner-only
// through the route's own declaration: a collaborator holding `EDIT_CONTENT` may edit content, photos, and features, and
// the code is none of those — it decides who may see the invitation at all, which the owner never delegates.
//
// Setting a code is gated by the pinned package's `PASSWORD_PROTECTION` key (L18.5). Removing one is not: withdrawing the
// key later must never lock an owner out of their own invitation, so the explicit act that opens the invitation back up
// stays available. The gate protects against granting the capability, not against the owner closing it.

/** The values of one set-or-replace write; the owner comes from the session, never from the request payload (S9). */
export interface SetInvitationPasswordInput {
  readonly ownerId: string;
  readonly id: string;
  readonly password: unknown;
}

/** The values of one removal; the owner comes from the session (S9). */
export interface ClearInvitationPasswordInput {
  readonly ownerId: string;
  readonly id: string;
}

/**
 * Sets or replaces the access code of a DRAFT or a PUBLISHED invitation (F13; L18.1). Answers only whether a code is now
 * set and the new version — never the code, never the hash — and every call raises the version, so every token minted
 * before it stops opening the invitation (L18.2).
 *
 * Answers null for an id that names nothing or another owner's invitation (A4), throws `InvitationNotEditableError` for
 * an archived one (A2), `InvalidInvitationPasswordError` with the domain's issues for a value that is not a usable code,
 * and `InvitationPasswordNotAvailableError` when the pinned package does not grant the key. A refused write stores
 * nothing, and the plain value is used for the hash only: it is not stored, returned, or logged.
 */
export class SetInvitationPasswordUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
  ) {}

  async execute(input: SetInvitationPasswordInput): Promise<InvitationPasswordState | null> {
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    const validated = validateInvitationPassword(input.password);
    if (validated.password === null) {
      throw new InvalidInvitationPasswordError(validated.issues);
    }
    // The grant is read from the catalog at request time, so withdrawing the key stops new codes immediately (L18.5).
    const entitlements = await this.catalog.findPackageEntitlements(stored.packageId);
    if (!(entitlements?.includedFeatureKeys.includes(PASSWORD_PROTECTION_FEATURE_KEY) ?? false)) {
      throw new InvitationPasswordNotAvailableError();
    }

    return this.invitations.setPassword(
      input.ownerId,
      input.id,
      await hashInvitationPassword(validated.password),
    );
  }
}

/**
 * Removes the access code of a DRAFT or a PUBLISHED invitation (F13; L18.1, L18.5), raising the version so every token
 * minted while the code was set stops opening it (L18.2). It is not gated by the catalog key on purpose: an owner whose
 * package no longer grants `PASSWORD_PROTECTION` must still be able to open their own invitation. Answers null for an id
 * that names nothing or another owner's invitation (A4) and throws `InvitationNotEditableError` for an archived one (A2).
 * A removal of a code that is not set changes nothing and answers the stored version with no code set.
 */
export class ClearInvitationPasswordUseCase {
  constructor(private readonly invitations: InvitationRepository) {}

  async execute(input: ClearInvitationPasswordInput): Promise<InvitationPasswordState | null> {
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }

    return this.invitations.clearPassword(input.ownerId, input.id);
  }
}
