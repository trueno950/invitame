import { InvitationAlreadyArchivedError, InvitationNotEditableError } from "./invitation.errors";

// The invitation lifecycle Milestone 4 writes (M4 T2; S7, A3): DRAFT -> ARCHIVED and nothing else.
// Publication adds its own states additively later. An archived invitation is read-only and is never
// deleted; a draft stays editable while it is incomplete.

/** The lifecycle states written in Milestone 4, spelled as the database enum. */
export const INVITATION_STATUSES = ["DRAFT", "ARCHIVED"] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Only a DRAFT changes; throws `InvitationNotEditableError` for any other status. */
export function assertEditable(status: InvitationStatus): void {
  if (status !== "DRAFT") {
    throw new InvitationNotEditableError(status);
  }
}

/**
 * The status after archiving: ARCHIVED from DRAFT. Archiving an already archived invitation throws
 * `InvitationAlreadyArchivedError`, so a repeated archive never looks like a successful change.
 */
export function archive(status: InvitationStatus): InvitationStatus {
  if (status !== "DRAFT") {
    throw new InvitationAlreadyArchivedError();
  }
  return "ARCHIVED";
}
