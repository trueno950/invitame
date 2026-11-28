/**
 * The language an invitation stores (F14; S2.14, L19.1, L19.5). This is the web's mirror of the API's own
 * `apps/api/src/invitations/domain/invitation-language.ts`; the web never imports API code, so the three values are
 * declared here too, and a change on one side is a change on the other.
 *
 * The stored value is presentation data and nothing else: `es` renders Spanish, `es-en` lets the guest choose, and
 * `en` renders English. `ENGLISH_INVITATION` is the catalog grant that lets the stored value reach a guest (L19.4).
 */

/** The three languages an invitation may store, in the order the owner's editor shows them (L19.1). */
export const INVITATION_LANGUAGES = ["es", "es-en", "en"] as const;

export type InvitationLanguage = (typeof INVITATION_LANGUAGES)[number];

/** The value a new invitation stores and the one every row that predates F14 reads (L19.1, L19.5). */
export const DEFAULT_INVITATION_LANGUAGE: InvitationLanguage = "es";

/** Whether a value is one exact member of the allow-list. */
export function isInvitationLanguage(value: unknown): value is InvitationLanguage {
  return typeof value === "string" && (INVITATION_LANGUAGES as readonly string[]).includes(value);
}

/**
 * A stored value read as a language (L19.5): a body written before F14, or a value this deployment does not know,
 * reads as Spanish, which is the column's default and the product's own language. Nothing is guessed from a value
 * that is almost a language.
 */
export function storedInvitationLanguage(value: unknown): InvitationLanguage {
  return isInvitationLanguage(value) ? value : DEFAULT_INVITATION_LANGUAGE;
}
