import { assertEditable } from "../domain/invitation-lifecycle";
import { remainingSlugRenames } from "../domain/invitation-slug";
import {
  addressFieldNames,
  isAddressFieldName,
  isLatitude,
  isLongitude,
  normalizePlaceQuery,
  PLACE_FIELD_ISSUE,
  type PlacePoint,
  validatePlaceWrite,
} from "../domain/invitation-place";
import {
  InvalidInvitationPlaceError,
  InvalidPlaceQueryError,
  PlaceSearchRateLimitedError,
} from "./invitation.application.errors";
import type { InvitationRepository } from "./invitation.repository";
import { type OwnedInvitation, toOwnedInvitation } from "./invitation.use-cases";
import type { InvitationCatalog } from "./invitation-catalog";
import { NO_PLACE_SEARCH, type PlaceSearch } from "./place-search";
import {
  INITIAL_OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "../../settings/application/operational-settings";
import { InMemoryPlaceSearchCache, placeSearchCacheKey } from "./place-search-cache";
import type { PlaceSearchRateLimiter } from "./place-search-rate-limiter";

// The place use cases (S1, S2; S3). Three commands, all owner-scoped and none of them reaching a geocoder a guest
// can see:
//
// - `SearchPlacesUseCase` answers the suggestions for the text an owner is typing. Ownership is checked first, so a
//   foreign invitation costs no provider request (A4); the query is bounded before anything else happens; a repeated
//   query answers from the short-lived cache and costs no request and no limit; a first query counts once against
//   the owner's own limit and asks the port once, and only an answer the provider really gave is cached — a lookup
//   that failed says nothing about the place, so it is never remembered as "no suggestion". A provider that is
//   unavailable answers no suggestion, so typing still works and the editor shows nothing intrusive (S2, S3).
// - `UpdateInvitationPlaceUseCase` stores the point the owner chose. `field` must name an address field of the pinned
//   template version's schema — read from the schema, never from a template name — and the label and both
//   coordinates must satisfy the bounds the columns also state.
// - `ClearInvitationPlaceUseCase` removes it.
//
// Both writes answer the owner's view of the invitation, so the editor refreshes the stored points without a second
// read, and both refuse an archived invitation exactly like every other edit (A2, S7).

const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name a stored row; a malformed id names nothing and never reaches a query. */
function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && INVITATION_ID.test(value);
}

/** What one suggestion may be: a point the domain accepts, so a drifted adapter cannot poison the cache. */
function usableSuggestions(places: readonly PlacePoint[], limit: number): PlacePoint[] {
  return places
    .filter(
      (place) =>
        typeof place.label === "string" &&
        place.label.trim() !== "" &&
        isLatitude(place.lat) &&
        isLongitude(place.lng),
    )
    .slice(0, limit)
    .map((place) => ({ label: place.label.trim(), lat: place.lat, lng: place.lng }));
}

/**
 * The answer of one bounded request (S2, S3): the suggestions, or the fact that the provider did not answer at all.
 * Nothing is cached when the provider failed.
 */
type PlaceSearchAnswer =
  | { readonly ok: true; readonly places: PlacePoint[] }
  | { readonly ok: false };

/** The values of one search: the owner from the session, the invitation, and the raw text of the field (S9). */
export interface SearchPlacesInput {
  ownerId: string;
  id: string;
  query: unknown;
}

/**
 * Finds the places matching the text an owner is typing (S2, S3). Answers at most five suggestions, most relevant
 * first, or null when no invitation of this owner has this id (A4). Throws `InvalidPlaceQueryError` for a text that
 * is not a string or is outside 3 to 120 characters, `PlaceSearchRateLimitedError` when the owner is over the limit,
 * and nothing else: a provider that is down is no suggestion, not an error.
 */
export class SearchPlacesUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly places: PlaceSearch = NO_PLACE_SEARCH,
    private readonly rateLimiter: PlaceSearchRateLimiter = { consume: async () => true },
    private readonly cache: InMemoryPlaceSearchCache = new InMemoryPlaceSearchCache(),
    // How many suggestions the owner sees (M9 T13; S5, S8): the settings row's `placeSearchResultLimit`, read on
    // every search so a lowered limit applies to the next answer, including one served from the cache.
    private readonly settings: OperationalSettingsReader = INITIAL_OPERATIONAL_SETTINGS_READER,
  ) {}

  async execute(input: SearchPlacesInput): Promise<readonly PlacePoint[] | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }

    const validation = normalizePlaceQuery(input.query);
    if (!validation.ok) {
      throw new InvalidPlaceQueryError([validation.issue]);
    }

    // The limit is read on every search, so a lowered one applies to the next answer — including a cached answer,
    // which is sliced again instead of being served at the width it was cached with (M9 T13; S5, S8).
    const limit = (await this.settings.current()).placeSearchResultLimit;
    const key = placeSearchCacheKey(validation.query);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached.slice(0, limit);
    }

    // Only a request that reaches the geocoder spends the owner's limit; a cached answer costs nothing (S2).
    if (!(await this.rateLimiter.consume(input.ownerId))) {
      throw new PlaceSearchRateLimitedError();
    }

    const answer = await this.ask(validation.query, limit);
    // A provider that failed says nothing about the place, so its failure is not an empty answer: only an answer
    // the provider really gave is cached, and the next identical query asks again (S2, S3).
    if (!answer.ok) {
      return [];
    }
    this.cache.set(key, answer.places);

    return answer.places;
  }

  /** One bounded request: the port answers nothing for a provider that is slow, down, or unusable (S2, S3). */
  private async ask(query: string, limit: number): Promise<PlaceSearchAnswer> {
    try {
      return { ok: true, places: usableSuggestions(await this.places.search(query), limit) };
    } catch {
      // The editor shows no suggestion rather than an error: the owner can keep typing the address by hand.
      return { ok: false };
    }
  }
}

/** The values of one place write: the owner from the session, the invitation, the field, and the chosen point. */
export interface UpdatePlaceInput {
  ownerId: string;
  id: string;
  field: unknown;
  label: unknown;
  lat: unknown;
  lng: unknown;
}

/** The values of one place clear: the owner from the session, the invitation, and the field. */
export interface ClearPlaceInput {
  ownerId: string;
  id: string;
  field: unknown;
}

/**
 * The address fields of the invitation's pinned version, read from its schema (S2, S3). A version whose schema
 * cannot be read answers none, so a field nobody could validate is refused instead of stored.
 */
async function addressFieldsOf(
  catalog: InvitationCatalog,
  templateVersionId: string,
): Promise<string[]> {
  const snapshot = await catalog.findVersionSchema(templateVersionId);

  return addressFieldNames(snapshot?.schema ?? null);
}

/** The field a request names, or the issue that refuses it (S2). */
function fieldIssue(field: unknown, declared: readonly string[]): string | null {
  if (!isAddressFieldName(field)) {
    return PLACE_FIELD_ISSUE;
  }
  return declared.includes(field) ? null : PLACE_FIELD_ISSUE;
}

/**
 * Stores the coordinates of one address field of a DRAFT or a PUBLISHED invitation (S2, S3). The field must be an
 * address field of the pinned schema, and the label and both coordinates must satisfy the bounds the columns state.
 * An archived invitation is refused before the request values are read (A2, S7); another owner's id answers null and
 * changes nothing (A4).
 */
export class UpdateInvitationPlaceUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
  ) {}

  async execute(input: UpdatePlaceInput): Promise<OwnedInvitation | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);

    const declared = await addressFieldsOf(this.catalog, stored.templateVersionId);
    const issue = fieldIssue(input.field, declared);
    if (issue !== null) {
      throw new InvalidInvitationPlaceError([issue]);
    }
    const field = input.field as string;
    const validation = validatePlaceWrite({
      label: input.label,
      lat: input.lat,
      lng: input.lng,
    });
    if (!validation.ok) {
      throw new InvalidInvitationPlaceError(validation.issues);
    }

    const updated = await this.invitations.updatePlace(input.ownerId, input.id, {
      field,
      ...validation.value,
    });

    return updated === null ? null : this.owned(updated);
  }

  /** The owner's view of the row the write answered, with the schema and the gated features it already had. */
  private async owned(stored: Parameters<typeof toOwnedInvitation>[0]): Promise<OwnedInvitation> {
    const [snapshot, entitlements, renames] = await Promise.all([
      this.catalog.findVersionSchema(stored.templateVersionId),
      this.catalog.findPackageEntitlements(stored.packageId),
      // The same owned invitation the read answers, so the same renames left (F11; L15.2, R3-001).
      this.invitations.countSlugAliases(stored.id),
    ]);

    return toOwnedInvitation(
      stored,
      snapshot?.schema ?? null,
      entitlements?.includedFeatureKeys ?? [],
      remainingSlugRenames(renames),
    );
  }
}

/**
 * Clears one stored place of a DRAFT or a PUBLISHED invitation (S2, S3), with the same field rule, the same archived
 * refusal, and the same owner scope as the write (A2, A4). The address text is untouched: the owner keeps the words
 * they typed and only loses the point.
 */
export class ClearInvitationPlaceUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
  ) {}

  async execute(input: ClearPlaceInput): Promise<OwnedInvitation | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);

    const declared = await addressFieldsOf(this.catalog, stored.templateVersionId);
    const issue = fieldIssue(input.field, declared);
    if (issue !== null) {
      throw new InvalidInvitationPlaceError([issue]);
    }

    const updated = await this.invitations.clearPlace(
      input.ownerId,
      input.id,
      input.field as string,
    );
    if (updated === null) {
      return null;
    }

    const [snapshot, entitlements, renames] = await Promise.all([
      this.catalog.findVersionSchema(updated.templateVersionId),
      this.catalog.findPackageEntitlements(updated.packageId),
      // The same owned invitation the read answers, so the same renames left (F11; L15.2, R3-001).
      this.invitations.countSlugAliases(updated.id),
    ]);

    return toOwnedInvitation(
      updated,
      snapshot?.schema ?? null,
      entitlements?.includedFeatureKeys ?? [],
      remainingSlugRenames(renames),
    );
  }
}
