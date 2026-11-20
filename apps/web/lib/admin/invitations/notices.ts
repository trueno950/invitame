import {
  INVITATION_SUPPORT_COPY,
  type InvitationsErrorCode,
  type InvitationsNoticeCode,
} from "./copy.ts";

/**
 * How the outcome of the support card's forms reaches the page (M9 T8; S4, S6). Each form is a server action that ends
 * with a redirect after POST (303), so it works without JavaScript and a reload never resubmits it. The result travels
 * in the target's query as `?notice=<code>` or `?error=<code>`: only a code from a fixed list, never text, an id, or a
 * reason, and the page looks the code up in its own tables, so a forged query can show only one of the fixed messages.
 * It mirrors `lib/admin/payments/notices.ts`, which does the same for the refund form.
 */

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export function invitationsErrorTarget(path: string, code: InvitationsErrorCode): string {
  return `${path}?error=${code}`;
}

export function invitationsNoticeTarget(path: string, code: InvitationsNoticeCode): string {
  return `${path}?notice=${code}`;
}

function lookup<T extends string>(
  table: Readonly<Record<T, string>>,
  value: string | string[] | undefined,
): value is T {
  return typeof value === "string" && Object.hasOwn(table, value);
}

export interface InvitationsPageNotices {
  notice?: string;
  /** The code names which refusal it was; the message is the Spanish text. */
  error?: { code: InvitationsErrorCode; message: string };
}

/** The messages the page shows for its query, if any; an unknown or repeated value shows nothing. */
export function invitationPageNotices(parameters: SearchParameters): InvitationsPageNotices {
  const { notice, error } = parameters;

  return {
    ...(lookup(INVITATION_SUPPORT_COPY.notice, notice)
      ? { notice: INVITATION_SUPPORT_COPY.notice[notice] }
      : {}),
    ...(lookup(INVITATION_SUPPORT_COPY.error, error)
      ? { error: { code: error, message: INVITATION_SUPPORT_COPY.error[error] } }
      : {}),
  };
}
