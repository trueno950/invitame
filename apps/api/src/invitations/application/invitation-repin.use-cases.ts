import { InvitationRepinConflictError } from "../domain/invitation.errors";
import {
  type DraftRepinInput,
  decideDraftRepin,
  type RepinSkipReason,
} from "../domain/invitation-repin";
import type { InvitationRepinRepository } from "./invitation-repin.repository";

// Re-pinning one existing draft (S5, S8.6). The application owns the operation: the domain decides whether this
// invitation may move and to which version, the port performs the one write, and the outcome names what happened so
// the operator's command can report it. Nothing is created, deleted, or retyped: the write changes
// `templateVersionId` only, so the content the customer typed stays stored (S8.2), and a content the target schema
// would refuse skips the invitation with the schema's own issues instead of storing it.

/** One invitation to consider, plus the target version the caller resolved from the catalog. */
export interface RepinDraftCommand extends DraftRepinInput {
  readonly invitationId: string;
}

/** What the operation did with one invitation. */
export type RepinDraftOutcome =
  | { readonly outcome: "moved"; readonly invitationId: string; readonly toVersionId: string }
  | {
      readonly outcome: "skipped";
      readonly invitationId: string;
      readonly reason: RepinSkipReason;
      readonly issues: readonly string[];
    };

/**
 * Moves one draft to its template's current published version, or answers why it stayed. The decision is the domain
 * rule `decideDraftRepin`; this use case adds only the write and its failure signal: a write that matched no row means
 * another request changed the invitation between the read and the move, which is reported as
 * `InvitationRepinConflictError` rather than as a successful or a silently skipped move.
 */
export class RepinDraftInvitationUseCase {
  constructor(private readonly invitations: InvitationRepinRepository) {}

  async execute(command: RepinDraftCommand): Promise<RepinDraftOutcome> {
    const decision = decideDraftRepin(command);

    if (!decision.move) {
      return {
        outcome: "skipped",
        invitationId: command.invitationId,
        reason: decision.reason,
        issues: decision.issues,
      };
    }

    const moved = await this.invitations.repinDraft(
      command.invitationId,
      command.pinnedVersionId,
      decision.toVersionId,
    );

    if (!moved) {
      throw new InvitationRepinConflictError(command.invitationId);
    }

    return {
      outcome: "moved",
      invitationId: command.invitationId,
      toVersionId: decision.toVersionId,
    };
  }
}
