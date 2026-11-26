import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";

// The persistence port of the draft re-pin (S5, S8.6), owned by this module and deliberately separate from
// `InvitationRepository`: the owner-scoped port answers only rows one customer owns, while this operation reads every
// stored invitation and moves a draft, so it is bound for the operator's command and never for an owner route. The
// move names the version it read and the invitation's DRAFT status in its own `WHERE`, so a concurrent publication or
// archive makes the write match nothing instead of touching a row that must not change (S5, A2).

/** One stored invitation as the re-pin reads it: its lifecycle state, the version it pins, and its content. */
export interface InvitationRepinCandidate {
  readonly invitationId: string;
  readonly status: InvitationStatus;
  /** The version this invitation pins today; the move names it so a concurrent change is detected. */
  readonly templateVersionId: string;
  /** The stored content, always a JSON object (the `Invitation_content_object` check). */
  readonly content: JsonObject;
}

/**
 * The re-pin's persistence port (S5, S8.6). Nothing is created, deleted, or rewritten except `templateVersionId` of
 * one DRAFT, and the database's `Invitation_pinned_fields_immutable` trigger refuses every other change.
 */
export interface InvitationRepinRepository {
  /**
   * Every stored invitation, oldest first, with the three fields the rule reads. It carries no owner, email, or slug:
   * the operation never needs them, and the report must not print them.
   */
  listCandidates(): Promise<InvitationRepinCandidate[]>;

  /**
   * Moves one DRAFT from the version it pinned to `toVersionId`, in one statement whose `WHERE` names the invitation,
   * the DRAFT status, and the version that was read, and whose `data` carries only `templateVersionId` — the content
   * is never touched (S8.2). Answers true when exactly one row moved; false, changing nothing, when the row is missing,
   * is no longer a DRAFT, or no longer pins `fromVersionId`, so a repeated run and a concurrent change are both
   * distinguishable from a successful move. The statement is atomic in PostgreSQL; the caller runs one per invitation,
   * so each move is its own transaction. The trigger refuses any target that is not the PUBLISHED version of the same
   * template, and that refusal propagates.
   */
  repinDraft(invitationId: string, fromVersionId: string, toVersionId: string): Promise<boolean>;
}

export const INVITATION_REPIN_REPOSITORY = Symbol("InvitationRepinRepository");
