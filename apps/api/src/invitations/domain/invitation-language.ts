// The language of an invitation (F14; S2.14, L19.1, L19.5). The owner stores one of three values, and the guest read
// answers the language the page actually renders:
//
// - `es`: every fixed text is Spanish, which is what the product always did and what a row that never chose a language
//   keeps reading;
// - `es-en`: both languages are available, so the guest page offers the ES / EN switch and remembers the choice;
// - `en`: the fixed texts are English only, for guests from abroad.
//
// The value is presentation data and nothing else: no text, no translation, and no locale-specific formatting is
// stored. The typed dictionary of every fixed Spanish and English text lives in the web, which is the only place a
// string is rendered; this module decides which language is stored and which one a guest reads.
//
// Package feature keys never select a code path (AGENTS.md): `ENGLISH_INVITATION` is the catalog's grant and this
// module is the implementation it enables, so a package that withdraws the key reads Spanish without the API losing
// the stored choice.

/** The three languages an invitation may store, in the order the owner's editor shows them (L19.1). */
export const INVITATION_LANGUAGES = ["es", "es-en", "en"] as const;

export type InvitationLanguage = (typeof INVITATION_LANGUAGES)[number];

/** The language a new invitation stores and the one every row that predates F14 reads (L19.1, L19.5). */
export const DEFAULT_INVITATION_LANGUAGE: InvitationLanguage = "es";

/**
 * The message a value that is not one of the three languages is refused with (L19.1). The stored value is one exact
 * member of the allow-list, never trimmed or case-folded, so a look-alike such as `ES` or `es ` is refused instead of
 * being stored as a language the guest page cannot resolve.
 */
export const INVITATION_LANGUAGE_ISSUE = "language must be one of es, es-en, en";

/** Whether a value is one exact member of the allow-list. */
export function isInvitationLanguage(value: unknown): value is InvitationLanguage {
  return typeof value === "string" && (INVITATION_LANGUAGES as readonly string[]).includes(value);
}

/**
 * A stored value read as a language (L19.5). A row written around the API — or a caller that answers no value at all,
 * like the fixtures of a server built before this column existed — reads as `es`, which is the column's default and the
 * answer an older body carries. Nothing is guessed from a value that is almost a language.
 */
export function storedInvitationLanguage(value: unknown): InvitationLanguage {
  return isInvitationLanguage(value) ? value : DEFAULT_INVITATION_LANGUAGE;
}

/** A normalized request value: the stored language, or the issue the client reads when the value is refused. */
export type InvitationLanguageValidation =
  | { readonly ok: true; readonly value: InvitationLanguage }
  | { readonly ok: false; readonly issue: string };

/**
 * Validates the `language` of a feature-settings write (L19.1). It is the write's last value, so its issue is answered
 * after every other one: a client that gets a list of issues always sees the language named by its own message.
 * `undefined` is refused here, because the use case resolves an omitted value from the stored one before validating —
 * exactly like the opening animation switch (L14.3).
 */
export function validateInvitationLanguage(value: unknown): InvitationLanguageValidation {
  return isInvitationLanguage(value)
    ? { ok: true, value }
    : { ok: false, issue: INVITATION_LANGUAGE_ISSUE };
}

/**
 * The language a guest's page renders (L19.5): the owner's choice while the pinned package grants `ENGLISH_INVITATION`,
 * and Spanish otherwise. The grant is read at request time, so a package that withdraws the key serves Spanish without
 * losing the stored choice, and re-granting it restores what the owner picked.
 */
export function effectiveInvitationLanguage(
  granted: boolean,
  chosen: InvitationLanguage,
): InvitationLanguage {
  return granted ? chosen : DEFAULT_INVITATION_LANGUAGE;
}
