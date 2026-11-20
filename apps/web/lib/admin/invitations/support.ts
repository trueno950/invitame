import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  type AdminActionReason,
  type AdminInvitationDetail,
} from "../../server/admin-invitations-client.ts";
import { INVITATION_SUPPORT_COPY, INVITATION_UNPUBLISH_REASON_LABELS } from "./copy.ts";

/**
 * What the «Acciones de soporte» card of one invitation renders (M9 T8; S4, S6, L9): the reason select, the note's
 * bound, and whether the unpublish form is offered at all. Only a published invitation has anything to unpublish, so the
 * card explains the absence instead of showing a control the API would refuse — the API is still the guard, and this
 * page is never one.
 *
 * The four reasons are the API's closed set in Spanish, in the order the page lists them; `OTHER` is the one whose note
 * the API requires, and the card says so before the administrator submits.
 */

/** One option of the reason select: the value the form posts and the Spanish label the page shows. */
export interface InvitationReasonOption {
  readonly value: AdminActionReason;
  readonly label: string;
}

export interface InvitationSupportView {
  /** Whether the card offers the unpublish form: only a published invitation can be unpublished (S4). */
  readonly canUnpublish: boolean;
  /** Why the form is absent, when it is; undefined while it is offered. */
  readonly unpublishHint: string | undefined;
  /** The closed set of reasons, in the page's own order. */
  readonly reasons: readonly InvitationReasonOption[];
  /** The note's bound, the column's own width; the textarea and the server both enforce it. */
  readonly noteMaxLength: number;
  /** The reason that turns the note from optional into required (L9). */
  readonly noteRequiredFor: AdminActionReason;
  /** The sentence the card shows so a support person never promises a refund (S4). */
  readonly noRefund: string;
}

/** The page's order: the reasons a support person reaches for first, and «Otro» last with its note. */
const REASON_ORDER: readonly AdminActionReason[] = [
  "ABUSE",
  "OWNER_REQUEST",
  "PAYMENT_ERROR",
  "OTHER",
];

/** The card of one invitation: the form's reason select, its note bound, and whether it is offered. */
export function invitationSupportView(detail: AdminInvitationDetail): InvitationSupportView {
  const canUnpublish = detail.status === "PUBLISHED";

  return {
    canUnpublish,
    unpublishHint: canUnpublish ? undefined : INVITATION_SUPPORT_COPY.notPublished,
    reasons: REASON_ORDER.map((value) => ({
      value,
      label: INVITATION_UNPUBLISH_REASON_LABELS[value],
    })),
    noteMaxLength: ADMIN_ACTION_NOTE_MAX_LENGTH,
    noteRequiredFor: "OTHER",
    noRefund: INVITATION_SUPPORT_COPY.noRefund,
  };
}
