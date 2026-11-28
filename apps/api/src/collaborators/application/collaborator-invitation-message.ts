import type { EmailMessage } from "../../email/application/email-sender.port";

/**
 * The co-host invitation email (F12; S2.12, L17.3). Neutral professional Spanish, in the second person the product uses
 * with a person («tú»), and deliberately bare: the link, how long it works, and what to do if it was not expected.
 *
 * It names no owner address, no invitation title, no price, and no permission list, because the recipient may not be
 * the person the owner meant to invite and an email is stored, forwarded, and indexed outside this product. The link is
 * the only thing it carries that is worth protecting, and the token inside it is single-use and expires in seven days.
 */

/** Where the emailed link points on the web: the acceptance screen the recipient opens after signing in. */
export const COLLABORATOR_ACCEPTANCE_PATH = "/colaboraciones/aceptar";

/** Builds the absolute acceptance link from the web origin and the plain token. */
export function collaboratorAcceptanceUrl(webOrigin: string, token: string): string {
  return `${webOrigin.replace(/\/+$/u, "")}${COLLABORATOR_ACCEPTANCE_PATH}?token=${encodeURIComponent(token)}`;
}

/** The function the module binds so the use case never reads configuration itself. */
export type CollaboratorAcceptanceLink = (token: string) => string;

export const COLLABORATOR_ACCEPTANCE_LINK = Symbol("CollaboratorAcceptanceLink");

export interface CollaboratorInvitationMessageInput {
  /** The invited address, already normalized: the message's only recipient. */
  readonly to: string;
  /** The absolute acceptance link, built from the deployment's own origin and the plain token. */
  readonly url: string;
  /** How many days the link works, stated in the message; the domain's seven. */
  readonly expiresInDays: number;
  /** Random per send; never derived from the token or the address. */
  readonly idempotencyKey: string;
}

/**
 * The message itself. The subject and both bodies say the same three things, and the link appears once in each form, so
 * the recipient can act from either their mail client's text view or its buttons.
 */
export function buildCollaboratorInvitationMessage(
  input: CollaboratorInvitationMessageInput,
): EmailMessage {
  return {
    to: input.to,
    subject: "Te invitaron a colaborar en una invitación de InvitaMe",
    text: [
      "Alguien te invitó a colaborar en una invitación de InvitaMe.",
      "",
      "Abre este enlace para aceptar la invitación:",
      input.url,
      "",
      `El enlace vence en ${input.expiresInDays} días y solo puede usarse una vez.`,
      "Necesitas entrar con esta misma dirección de correo.",
      "Si no esperabas esta invitación, puedes ignorar este mensaje.",
    ].join("\n"),
    html: [
      "<p>Alguien te invitó a colaborar en una invitación de InvitaMe.</p>",
      `<p>Abre este enlace para aceptar la invitación: <a href="${input.url}">Aceptar la invitación</a></p>`,
      `<p>El enlace vence en ${input.expiresInDays} días y solo puede usarse una vez. ` +
        "Necesitas entrar con esta misma dirección de correo.</p>",
      "<p>Si no esperabas esta invitación, puedes ignorar este mensaje.</p>",
    ].join("\n"),
    idempotencyKey: input.idempotencyKey,
  };
}
