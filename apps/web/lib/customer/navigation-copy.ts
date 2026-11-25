/**
 * The copy of the navigation the creation flow shares (T2; S2.3, S2.5, S2.6). The owner could not see «Volver a mis
 * invitaciones» at any step, so the same way back is now a visible pill at the top-left of every owner page, and the
 * list names each invitation by its celebration instead of its generated slug.
 *
 * It lives here rather than in `copy.ts` so the shared navigation has one file of its own; every string is neutral
 * professional Spanish, like the rest of the product copy, and the technical identifiers stay in English (AGENTS.md).
 */
export const NAVIGATION_COPY = {
  /**
   * The text of the shared back pill (S2.3): the same words on the chooser, the editor, the payment pages, the
   * preview, and the guest list, so the way back to the list never has to be looked for again.
   */
  backToInvitations: "Mis invitaciones",
  /**
   * The pill's accessible name: it says what the action does instead of only naming the destination, and it keeps
   * the visible words so a voice-control user can still name the link (S3).
   */
  backToInvitationsLabel: "Volver a mis invitaciones",
  /** The card's title while the content does not name a celebration yet (S2.6). */
  cardTitle: "Tu invitación",
  /** The card's date line, labelled so the date never depends on its position alone (S3). */
  cardDate: (date: string) => `Fecha: ${date}`,
  /**
   * The card's second line while the invitation has no date: the public slug, which is what the old list showed and
   * what still identifies an invitation the owner has not filled in (S2.6).
   */
  cardSlug: (slug: string) => `Identificador: ${slug}`,
} as const;
