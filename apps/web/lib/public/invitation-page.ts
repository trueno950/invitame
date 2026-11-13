import { PUBLIC_INVITATION_COPY } from "../customer/copy.ts";

/**
 * The guest's page of a published invitation (M5 T5; S5, A5, A8). The public URL lives under `/i`, which
 * does not collide with future site pages; the share metadata is built only from the stored content, with
 * no generated image, and every invitation page is `noindex, nofollow`.
 */

/** The segment of the public URL, as the owner chose it (S5): `/i/<slug>`. */
export const INVITATION_PUBLIC_PATH_PREFIX = "/i";

/** The public URL of an invitation slug (S5). A slug is validated before it reaches this function. */
export function publicInvitationPath(slug: string): string {
  return `${INVITATION_PUBLIC_PATH_PREFIX}/${slug}`;
}

/** About how long the share description is; a longer message is cut with an ellipsis (A8). */
export const INVITATION_DESCRIPTION_MAX_LENGTH = 150;

/** A page never indexed by a search engine (A5), or described in the share preview by anyone else (A8). */
export const INVITATION_ROBOTS = { index: false, follow: false } as const;

/** The share metadata of one invitation page, shaped as Next.js reads it. */
export interface InvitationPageMetadata {
  title: string;
  description?: string;
  robots: { index: false; follow: false };
  openGraph: { title: string; description?: string };
}

/** The text of a content property when it is a usable string; empty when it is missing or not text. */
function contentText(content: unknown, name: string): string {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return "";
  }

  const value = Object.hasOwn(content, name)
    ? (content as Record<string, unknown>)[name]
    : undefined;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * One line of text, at most `maxLength` characters, cut at a word boundary when there is one near the
 * limit and ended with an ellipsis. Whitespace is collapsed first, so a stored message with line breaks
 * still reads as one share description.
 */
export function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const cut = normalized.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut;

  return `${body.trimEnd()}…`;
}

/**
 * The static share metadata of an invitation page (A5, A8): the title names the celebrant when the
 * content has one (a baby shower names the baby instead, S13), the description is the stored message shortened to about 150 characters, and the page
 * asks no search engine and no share crawler to index or follow it. No image is generated.
 */
export function invitationMetadata(content: unknown): InvitationPageMetadata {
  const celebrantName = contentText(content, "celebrantName") || contentText(content, "babyName");
  const title =
    celebrantName === ""
      ? PUBLIC_INVITATION_COPY.titleFallback
      : PUBLIC_INVITATION_COPY.title(celebrantName);
  const message = contentText(content, "message");
  const description =
    message === "" ? undefined : truncateText(message, INVITATION_DESCRIPTION_MAX_LENGTH);

  return {
    title,
    ...(description === undefined ? {} : { description }),
    robots: { ...INVITATION_ROBOTS },
    openGraph: {
      title,
      ...(description === undefined ? {} : { description }),
    },
  };
}
