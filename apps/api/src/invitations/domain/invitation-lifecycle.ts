import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "./invitation.errors";

// The invitation lifecycle (M4 T2 and M5 T2; S2, S7, A2): DRAFT -> PUBLISHED -> DRAFT, and DRAFT or PUBLISHED
// -> ARCHIVED. A draft stays editable while it is incomplete; a published invitation stays editable live and
// can be unpublished back to DRAFT; archiving is terminal and an archived invitation is read-only and never
// deleted.

/** The lifecycle states, spelled as the database enum. */
export const INVITATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Only a DRAFT or a PUBLISHED invitation changes; a published one changes live (S7). Throws
 * `InvitationNotEditableError` for ARCHIVED.
 */
export function assertEditable(status: InvitationStatus): void {
  if (status === "ARCHIVED") {
    throw new InvitationNotEditableError(status);
  }
}

/**
 * The status after publishing: PUBLISHED from DRAFT. Publishing an already published invitation throws
 * `InvitationAlreadyPublishedError`, and an archived one throws `InvitationAlreadyArchivedError` because
 * archiving is terminal.
 */
export function publish(status: InvitationStatus): InvitationStatus {
  switch (status) {
    case "DRAFT":
      return "PUBLISHED";
    case "PUBLISHED":
      throw new InvitationAlreadyPublishedError();
    case "ARCHIVED":
      throw new InvitationAlreadyArchivedError();
  }
}

/**
 * The status after unpublishing: DRAFT from PUBLISHED, so the owner can edit and publish again (S7).
 * Unpublishing a draft that was never published throws `InvitationNotPublishedError`, and an archived
 * invitation throws `InvitationAlreadyArchivedError` because archiving is terminal.
 */
export function unpublish(status: InvitationStatus): InvitationStatus {
  switch (status) {
    case "PUBLISHED":
      return "DRAFT";
    case "DRAFT":
      throw new InvitationNotPublishedError();
    case "ARCHIVED":
      throw new InvitationAlreadyArchivedError();
  }
}

/**
 * The status after archiving: ARCHIVED from DRAFT or from PUBLISHED (A2). Archiving an already archived
 * invitation throws `InvitationAlreadyArchivedError`, so a repeated archive never looks like a successful
 * change.
 */
export function archive(status: InvitationStatus): InvitationStatus {
  switch (status) {
    case "DRAFT":
    case "PUBLISHED":
      return "ARCHIVED";
    case "ARCHIVED":
      throw new InvitationAlreadyArchivedError();
  }
}
