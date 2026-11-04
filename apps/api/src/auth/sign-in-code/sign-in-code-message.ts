import type { EmailMessage } from "../../email/application/email-sender.port";

/** S15: a code expires after 300 seconds; the message states the same validity in minutes. */
export const SIGN_IN_CODE_LENGTH = 6;
export const SIGN_IN_CODE_EXPIRES_IN_SECONDS = 300;
export const SIGN_IN_CODE_ALLOWED_ATTEMPTS = 3;

const VALIDITY_MINUTES = SIGN_IN_CODE_EXPIRES_IN_SECONDS / 60;

export interface SignInCodeMessageInput {
  to: string;
  code: string;
  /** Random per send; never derived from the code or the address. */
  idempotencyKey: string;
}

/**
 * The sign-in code email in neutral, professional Spanish. It carries the code and its validity and
 * nothing else personal: no name, no account state, and no link.
 */
export function buildSignInCodeMessage(input: SignInCodeMessageInput): EmailMessage {
  return {
    to: input.to,
    subject: "Código de acceso a InvitaMe",
    text: [
      `Código de acceso a InvitaMe: ${input.code}`,
      "",
      `Este código vence en ${VALIDITY_MINUTES} minutos y solo puede usarse una vez.`,
      "Si no se solicitó este código, no es necesario hacer nada.",
    ].join("\n"),
    html: [
      `<p>Código de acceso a InvitaMe: <strong>${input.code}</strong></p>`,
      `<p>Este código vence en ${VALIDITY_MINUTES} minutos y solo puede usarse una vez.</p>`,
      "<p>Si no se solicitó este código, no es necesario hacer nada.</p>",
    ].join("\n"),
    idempotencyKey: input.idempotencyKey,
  };
}
