import {
  type AdminInvitationQuery,
  type AdminInvitationStatus,
  isInvitationCursor,
} from "../../server/admin-invitations-client.ts";
import { INVITATIONS_PATHS, type INVITATION_STATUS_FILTER_LABELS } from "./copy.ts";

/**
 * The search of `/admin/invitaciones` (M9 T3; S1, L4). The page validates its own query before anything reaches the
 * API: the slug prefix is trimmed and bounded, `estado` is one of the page's closed set of values, and the cursor is
 * passed through only when it could be the API's own token. A value the page cannot read is shown as no filter, so a
 * forged or mistyped query narrows nothing and can never make the API answer 400.
 *
 * The filter names are the page's (`slug`, `estado`, `cursor`), not the API's: `estado` is Spanish, and the mapping to
 * the stored `DRAFT`/`PUBLISHED`/`ARCHIVED` happens in `invitationListQuery`, in one place.
 */

/** The query of a page as Next.js hands it to a server component. */
type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

/** The page's own `estado` values, and the API status each one asks for. */
export type InvitationStatusFilter = keyof typeof INVITATION_STATUS_FILTER_LABELS;

const STATUS_BY_FILTER: Readonly<Record<InvitationStatusFilter, AdminInvitationStatus>> = {
  borrador: "DRAFT",
  publicada: "PUBLISHED",
  archivada: "ARCHIVED",
};

/** The slug column is a `VARCHAR(60)`, so a prefix longer than that names nothing (S1). */
export const MAX_SLUG_FILTER_LENGTH = 60;

/**
 * What a prefix of a stored slug can be: lower or upper case letters, digits, and hyphens (the case-insensitive prefix
 * the API matches). It may end with a hyphen, because `ana-y-daniel` has the prefix `ana-y-`.
 */
const SLUG_PREFIX = /^[A-Za-z0-9-]+$/;

/** The filters the page is showing, and exactly what a next-page link must carry again. */
export interface InvitationFilters {
  readonly slug?: string;
  readonly estado?: InvitationStatusFilter;
  readonly cursor?: string;
}

/**
 * The one value of a query parameter, or none: Next.js answers a repeated parameter as an array, and a repeated filter
 * is not a filter the page offered.
 */
function single(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && value.length === 1 ? value[0] : undefined;
}

function readSlug(value: string | undefined): string | undefined {
  const slug = value?.trim();

  return slug !== undefined &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_FILTER_LENGTH &&
    SLUG_PREFIX.test(slug)
    ? slug
    : undefined;
}

function readStatus(value: string | undefined): InvitationStatusFilter | undefined {
  return value !== undefined && Object.hasOwn(STATUS_BY_FILTER, value)
    ? (value as InvitationStatusFilter)
    : undefined;
}

/** The filters the page shows, from its query: each one is either the value the page offered or absent. */
export function parseInvitationFilters(parameters: SearchParameters): InvitationFilters {
  const slug = readSlug(single(parameters.slug));
  const estado = readStatus(single(parameters.estado));
  const cursor = single(parameters.cursor);

  return {
    ...(slug === undefined ? {} : { slug }),
    ...(estado === undefined ? {} : { estado }),
    ...(isInvitationCursor(cursor) ? { cursor } : {}),
  };
}

/** Whether the page is narrowing the list, so an empty table can say which empty it is. */
export function hasInvitationFilters(filters: InvitationFilters): boolean {
  return filters.slug !== undefined || filters.estado !== undefined;
}

/**
 * The API query for these filters: the stored status in place of the page's `estado`, and nothing for a filter the page
 * left empty. The client adds its own bounded limit.
 */
export function invitationListQuery(filters: InvitationFilters): AdminInvitationQuery {
  return {
    ...(filters.slug === undefined ? {} : { slug: filters.slug }),
    ...(filters.estado === undefined ? {} : { status: STATUS_BY_FILTER[filters.estado] }),
    ...(filters.cursor === undefined ? {} : { cursor: filters.cursor }),
  };
}

/**
 * The link to the next page: the same filters and the cursor the API answered, in the page's own parameter names. A
 * cursor the page would refuse to read back gets no link at all, so «Siguiente página» never leads to an unfiltered
 * list. The index path is the page's, not the API's.
 */
export function nextPageHref(filters: InvitationFilters, nextCursor: string): string | undefined {
  if (!isInvitationCursor(nextCursor)) {
    return undefined;
  }

  const parameters = new URLSearchParams();

  if (filters.slug !== undefined) {
    parameters.set("slug", filters.slug);
  }
  if (filters.estado !== undefined) {
    parameters.set("estado", filters.estado);
  }
  parameters.set("cursor", nextCursor);

  return `${INVITATIONS_PATHS.index}?${parameters.toString()}`;
}
