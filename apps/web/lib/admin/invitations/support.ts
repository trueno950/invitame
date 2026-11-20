import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  type AccountStatus,
  type AdminActionReason,
  type AdminInvitationDetail,
} from "../../server/admin-invitations-client.ts";
import {
  INVITATION_SUPPORT_COPY,
  INVITATION_UNPUBLISH_REASON_LABELS,
  OWNER_ACCOUNT_STATUS_LABELS,
} from "./copy.ts";

/**
 * What the «Acciones de soporte» card of one invitation renders (M9 T8, T9; S4, S6, L8, L9): the reason select, the
 * note's bound, whether the unpublish form is offered at all, and — since T9 — the owner's own section. Only a
 * published invitation has anything to unpublish, so the card explains the absence instead of showing a control the
 * API would refuse; the owner's account offers «Desactivar cuenta» while it is active, «Reactivar cuenta» while it is
 * disabled, and «Reenviar código de acceso» while it may sign in by code. The API is still the guard, and this page is
 * never one: a hidden form is a convenience, not a permission.
 *
 * The four reasons are the API's closed set in Spanish, in the order the page lists them; `OTHER` is the one whose note
 * the API requires, and the card says so before the administrator submits.
 */

/** One option of the reason select: the value the form posts and the Spanish label the page shows. */
export interface InvitationReasonOption {
  readonly value: AdminActionReason;
  readonly label: string;
}

/** The owner's account section: the stored state and which of the three account controls the page offers (T9). */
export interface InvitationOwnerSupportView {
  /** The status the detail answered, or null when no stored account answers for the owner. */
  readonly status: AccountStatus | null;
  /** The status in Spanish, or the sentence the card shows when it has none. */
  readonly statusLabel: string;
  readonly canDisable: boolean;
  readonly canReactivate: boolean;
  readonly canResendSignInCode: boolean;
  /** Why a control is absent, when one is; undefined while every offered control applies. */
  readonly hint: string | undefined;
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
  /** The owner's account section (T9; S4, L8, L9). */
  readonly owner: InvitationOwnerSupportView;
}

/** The page's order: the reasons a support person reaches for first, and «Otro» last with its note. */
const REASON_ORDER: readonly AdminActionReason[] = [
  "ABUSE",
  "OWNER_REQUEST",
  "PAYMENT_ERROR",
  "OTHER",
];

/** The owner's section of one invitation's card, from the status the detail answered. */
function ownerSupportView(status: AccountStatus | null): InvitationOwnerSupportView {
  const active = status === "ACTIVE";
  const disabled = status === "DISABLED";

  return {
    status,
    statusLabel:
      status === null
        ? INVITATION_SUPPORT_COPY.ownerUnknownHint
        : OWNER_ACCOUNT_STATUS_LABELS[status],
    canDisable: active,
    canReactivate: disabled,
    // A disabled account receives no code (the API answers 409 and the sender refuses it too), so the card offers the
    // resend only while the owner may actually sign in.
    canResendSignInCode: active,
    hint: disabled ? INVITATION_SUPPORT_COPY.ownerDisabledHint : undefined,
  };
}

/** The card of one invitation: the form's reason select, its note bound, and whether each form is offered. */
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
    owner: ownerSupportView(detail.ownerStatus),
  };
}
