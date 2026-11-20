import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import type { PlacePoint } from "../domain/invitation-place";
import {
  InvalidInvitationPlaceError,
  InvalidPlaceQueryError,
  PlaceSearchRateLimitedError,
} from "./invitation.application.errors";
import type {
  InvitationFeatureSettingsWrite,
  InvitationPlaceWrite,
  InvitationRecordWithMusic,
  InvitationRepository,
  NewInvitation,
} from "./invitation.repository";
import type { InvitationCatalog } from "./invitation-catalog";
import {
  ClearInvitationPlaceUseCase,
  SearchPlacesUseCase,
  UpdateInvitationPlaceUseCase,
} from "./invitation-place.use-cases";
import type { PlaceSearch } from "./place-search";
import { InMemoryPlaceSearchCache, placeSearchCacheKey } from "./place-search-cache";
import type { PlaceSearchRateLimiter } from "./place-search-rate-limiter";

// The place use cases (S1-S3): the search answers at most five suggestions for the text the owner typed, asks the
// geocoder once per distinct query, and counts the request against the owner's own limit; the write stores the
// coordinates of an address field of the pinned template version and the clear removes them. The ports are in
// memory, so no test reaches the network or the database, and the catalog is read for one thing only: which fields
// of the pinned schema are addresses.

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_INVITATION_ID = "44444444-4444-4444-8444-444444444444";

const SCHEMA = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 240 },
    ceremonyAddress: { type: "string", maxLength: 240 },
    receptionPlace: { type: "string", maxLength: 120 },
  },
};

const SAN_JOSE: PlacePoint = {
  label: "Parroquia de San José, Calle Hidalgo 12, Querétaro, Querétaro",
  lat: 20.5888,
  lng: -100.3899,
};

const AT = new Date("2026-11-23T10:00:00.000Z");

function record(overrides: Partial<InvitationRecordWithMusic> = {}): InvitationRecordWithMusic {
  return {
    id: INVITATION_ID,
    ownerId: "owner-1",
    templateVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    slug: "invitacion-abc123",
    status: "DRAFT",
    content: {},
    timeZone: "America/Mexico_City",
    whatsappPhone: null,
    playlistUrl: null,
    playlistTitle: null,
    playlistCoverUrl: null,
    rsvpDeadline: null,
    rsvpPartyLimit: 4,
    archivedAt: null,
    publishedAt: null,
    firstPublishedAt: null,
    expiresAt: null,
    createdAt: AT,
    updatedAt: AT,
    places: {},
    ...overrides,
  };
}

/** The invitation port, with only the place writes and the owner read under test. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecordWithMusic[] = [];
  readonly writes: InvitationPlaceWrite[] = [];
  readonly cleared: Array<{ id: string; field: string }> = [];

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    return row === undefined ? null : structuredClone(row);
  }

  async updatePlace(
    ownerId: string,
    id: string,
    place: InvitationPlaceWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (row === undefined) {
      return null;
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    this.writes.push(place);
    row.places = {
      ...row.places,
      [place.field]: { label: place.label, lat: place.lat, lng: place.lng },
    };
    return structuredClone(row);
  }

  async clearPlace(
    ownerId: string,
    id: string,
    field: string,
  ): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (row === undefined) {
      return null;
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    this.cleared.push({ id, field });
    const remaining = Object.entries(row.places).filter(([key]) => key !== field);
    row.places = Object.fromEntries(remaining);
    return structuredClone(row);
  }

  async create(_input: NewInvitation): Promise<InvitationRecordWithMusic> {
    throw new Error("not used");
  }

  async listOwned(_ownerId: string): Promise<InvitationRecordWithMusic[]> {
    throw new Error("not used");
  }

  async updateContent(
    _ownerId: string,
    _id: string,
    _content: JsonObject,
  ): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async updateFeatures(
    _ownerId: string,
    _id: string,
    _features: InvitationFeatureSettingsWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async archive(_ownerId: string, _id: string): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async publish(
    _ownerId: string,
    _id: string,
    _at: Date,
  ): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async unpublish(_ownerId: string, _id: string): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async findPublishedBySlug(_slug: string): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }
}

/** The catalog, with the one schema the place write validates its field against. */
class MemoryCatalog implements InvitationCatalog {
  schema: unknown = SCHEMA;

  async findPublishedVersion(): Promise<null> {
    throw new Error("not used");
  }

  async findVersionSchema(): Promise<{ id: string; schema: unknown }> {
    return { id: VERSION_ID, schema: this.schema };
  }

  async findPackageEntitlements(): Promise<{ status: string; includedFeatureKeys: string[] }> {
    return { status: "ACTIVE", includedFeatureKeys: ["MAP"] };
  }

  async findVersionRenderData(): Promise<null> {
    throw new Error("not used");
  }

  isRendererRegistered(): boolean {
    return true;
  }
}

/** The geocoder port in memory: every search is recorded and answered from `answer`. */
class MemoryPlaceSearch implements PlaceSearch {
  answer: PlacePoint[] = [SAN_JOSE];
  failure: Error | null = null;
  readonly asked: string[] = [];

  async search(query: string): Promise<PlacePoint[]> {
    this.asked.push(query);
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.answer;
  }
}

/** The owner limit in memory: it counts and answers whatever a test chose. */
class MemoryPlaceSearchLimiter implements PlaceSearchRateLimiter {
  allow = true;
  readonly consumed: string[] = [];

  async consume(ownerId: string): Promise<boolean> {
    this.consumed.push(ownerId);
    return this.allow;
  }
}

function build() {
  const repository = new MemoryInvitationRepository();
  const catalog = new MemoryCatalog();
  const search = new MemoryPlaceSearch();
  const limiter = new MemoryPlaceSearchLimiter();
  const cache = new InMemoryPlaceSearchCache();

  repository.rows.push(record());

  return {
    repository,
    catalog,
    search,
    limiter,
    cache,
    searching: new SearchPlacesUseCase(repository, search, limiter, cache),
    updating: new UpdateInvitationPlaceUseCase(repository, catalog),
    clearing: new ClearInvitationPlaceUseCase(repository, catalog),
  };
}

describe("place search use case (S2, S3)", () => {
  it("answers the suggestions of the port for the text the owner typed, trimmed", async () => {
    const { searching, search, limiter } = build();

    const answer = await searching.execute({
      ownerId: "owner-1",
      id: INVITATION_ID,
      query: "  Parroquia de San José  ",
    });

    assert.deepEqual(answer, [SAN_JOSE]);
    assert.deepEqual(search.asked, ["Parroquia de San José"]);
    // The request is counted against the owner, whose id is the only key the limit needs (S2, S3).
    assert.deepEqual(limiter.consumed, ["owner-1"]);
  });

  it("asks the geocoder once for a repeated query and answers the rest from the cache", async () => {
    const { searching, search, limiter } = build();

    await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" });
    const second = await searching.execute({
      ownerId: "owner-1",
      id: INVITATION_ID,
      query: "  QUERÉTARO  ",
    });

    assert.deepEqual(second, [SAN_JOSE]);
    assert.equal(search.asked.length, 1);
    // A cached answer costs the owner nothing: retyping the same address never spends the limit.
    assert.equal(limiter.consumed.length, 1);
  });

  it("gives a different query its own request and its own cache entry", async () => {
    const { searching, search } = build();

    await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" });
    await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "san miguel" });

    assert.deepEqual(search.asked, ["querétaro", "san miguel"]);
  });

  it("answers nothing for another owner's invitation and asks nothing", async () => {
    const { searching, search, limiter } = build();

    const answer = await searching.execute({
      ownerId: "owner-2",
      id: INVITATION_ID,
      query: "querétaro",
    });
    const unknown = await searching.execute({
      ownerId: "owner-1",
      id: OTHER_INVITATION_ID,
      query: "querétaro",
    });

    assert.equal(answer, null);
    assert.equal(unknown, null);
    assert.deepEqual(search.asked, []);
    assert.deepEqual(limiter.consumed, []);
  });

  it("refuses a query that is too short or is not text before the port is asked", async () => {
    const { searching, search, limiter } = build();

    for (const query of ["ab", "   ", 42, undefined]) {
      await assert.rejects(
        searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query }),
        InvalidPlaceQueryError,
      );
    }
    assert.deepEqual(search.asked, []);
    assert.deepEqual(limiter.consumed, []);
  });

  it("refuses the request when the owner reached the limit, without asking the geocoder", async () => {
    const { searching, search, limiter } = build();
    limiter.allow = false;

    await assert.rejects(
      searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" }),
      PlaceSearchRateLimitedError,
    );
    assert.deepEqual(search.asked, []);
  });

  it("keeps at most five suggestions and drops a point the domain would refuse", async () => {
    const { searching, search } = build();
    search.answer = [
      ...Array.from({ length: 6 }, (_unused, index) => ({
        label: `Lugar ${index}`,
        lat: 20 + index,
        lng: -100,
      })),
      { label: "Fuera de rango", lat: 91, lng: -100 },
      { label: "", lat: 20, lng: -100 },
    ];

    const answer = await searching.execute({
      ownerId: "owner-1",
      id: INVITATION_ID,
      query: "lugar",
    });

    assert.deepEqual(
      answer?.map((place) => place.label),
      ["Lugar 0", "Lugar 1", "Lugar 2", "Lugar 3", "Lugar 4"],
    );
  });

  it("answers nothing when the geocoder is unavailable, and the owner can keep typing", async () => {
    const { searching, search } = build();
    search.failure = new TypeError("connect ECONNREFUSED");

    assert.deepEqual(
      await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" }),
      [],
    );
  });

  it("does not cache a failed lookup, so the next identical query asks the geocoder again (S2, S3)", async () => {
    const { searching, search, cache } = build();
    search.failure = new TypeError("connect ECONNREFUSED");

    assert.deepEqual(
      await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" }),
      [],
    );

    // The provider answers again: an earlier failure is not an empty answer the cache would repeat.
    search.failure = null;
    assert.deepEqual(
      await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" }),
      [SAN_JOSE],
    );
    assert.deepEqual(search.asked, ["querétaro", "querétaro"]);
    assert.equal(cache.size, 1);
  });

  it("still caches an empty answer the provider really gave (S2)", async () => {
    const { searching, search, cache } = build();
    search.answer = [];

    await searching.execute({ ownerId: "owner-1", id: INVITATION_ID, query: "querétaro" });
    const second = await searching.execute({
      ownerId: "owner-1",
      id: INVITATION_ID,
      query: "querétaro",
    });

    assert.deepEqual(second, []);
    assert.equal(search.asked.length, 1);
    assert.equal(cache.size, 1);
  });
});

describe("the search cache (S2)", () => {
  it("normalizes the key so case and spacing never spend a second request", () => {
    assert.equal(placeSearchCacheKey("  Parroquia   de San José "), "parroquia de san josé");
    assert.equal(placeSearchCacheKey("PARROQUIA DE SAN JOSÉ"), "parroquia de san josé");
  });

  it("expires an entry after its time to live", () => {
    let now = 0;
    const cache = new InMemoryPlaceSearchCache({ ttlMs: 1_000, now: () => now });

    cache.set("querétaro", [SAN_JOSE]);
    assert.deepEqual(cache.get("querétaro"), [SAN_JOSE]);
    now = 1_000;
    assert.equal(cache.get("querétaro"), undefined);
    assert.equal(cache.size, 0);
  });

  it("keeps its size bounded, dropping the least recently stored entry first", () => {
    const cache = new InMemoryPlaceSearchCache({ maxEntries: 2 });

    cache.set("a", [SAN_JOSE]);
    cache.set("b", [SAN_JOSE]);
    cache.set("c", [SAN_JOSE]);

    assert.equal(cache.size, 2);
    assert.equal(cache.get("a"), undefined);
    assert.deepEqual(cache.get("c"), [SAN_JOSE]);
  });
});

describe("place write and clear use cases (S2, S3)", () => {
  it("stores the coordinates of an address field of the pinned schema", async () => {
    const { updating, repository } = build();

    const answer = await updating.execute({
      ownerId: "owner-1",
      id: INVITATION_ID,
      field: "ceremonyAddress",
      label: SAN_JOSE.label,
      lat: SAN_JOSE.lat,
      lng: SAN_JOSE.lng,
    });

    assert.deepEqual(repository.writes, [{ field: "ceremonyAddress", ...SAN_JOSE }]);
    assert.deepEqual(answer?.places, { ceremonyAddress: SAN_JOSE });
  });

  it("refuses a field the pinned schema does not declare, or one that is not an address", async () => {
    const { updating, repository } = build();

    for (const field of ["receptionPlace", "title", "notDeclaredAddress", "", "a".repeat(65)]) {
      await assert.rejects(
        updating.execute({
          ownerId: "owner-1",
          id: INVITATION_ID,
          field,
          label: SAN_JOSE.label,
          lat: SAN_JOSE.lat,
          lng: SAN_JOSE.lng,
        }),
        InvalidInvitationPlaceError,
        field,
      );
    }
    assert.deepEqual(repository.writes, []);
  });

  it("refuses a label or a coordinate the database would refuse, and stores nothing", async () => {
    const { updating, repository } = build();

    for (const body of [
      { label: "", lat: 20, lng: -100 },
      { label: SAN_JOSE.label, lat: 91, lng: -100 },
      { label: SAN_JOSE.label, lat: 20, lng: -181 },
      { label: SAN_JOSE.label, lat: "20", lng: -100 },
    ]) {
      await assert.rejects(
        updating.execute({
          ownerId: "owner-1",
          id: INVITATION_ID,
          field: "address",
          ...body,
        }),
        InvalidInvitationPlaceError,
      );
    }
    assert.deepEqual(repository.writes, []);
  });

  it("refuses an archived invitation, exactly like every other edit", async () => {
    const { updating, repository } = build();
    repository.rows[0] = record({ status: "ARCHIVED" });

    await assert.rejects(
      updating.execute({
        ownerId: "owner-1",
        id: INVITATION_ID,
        field: "address",
        label: SAN_JOSE.label,
        lat: SAN_JOSE.lat,
        lng: SAN_JOSE.lng,
      }),
      InvitationNotEditableError,
    );
  });

  it("answers nothing for another owner's invitation", async () => {
    const { updating, repository } = build();

    assert.equal(
      await updating.execute({
        ownerId: "owner-2",
        id: INVITATION_ID,
        field: "address",
        label: SAN_JOSE.label,
        lat: SAN_JOSE.lat,
        lng: SAN_JOSE.lng,
      }),
      null,
    );
    assert.deepEqual(repository.writes, []);
  });

  it("clears a stored place and keeps the rest", async () => {
    const { clearing, repository } = build();
    repository.rows[0] = record({
      places: { address: SAN_JOSE, ceremonyAddress: { ...SAN_JOSE, lat: 19 } },
    });

    const answer = await clearing.execute({
      ownerId: "owner-1",
      id: INVITATION_ID,
      field: "address",
    });

    assert.deepEqual(repository.cleared, [{ id: INVITATION_ID, field: "address" }]);
    assert.deepEqual(answer?.places, { ceremonyAddress: { ...SAN_JOSE, lat: 19 } });
  });

  it("refuses to clear a field that is not an address field", async () => {
    const { clearing, repository } = build();

    await assert.rejects(
      clearing.execute({ ownerId: "owner-1", id: INVITATION_ID, field: "title" }),
      InvalidInvitationPlaceError,
    );
    assert.deepEqual(repository.cleared, []);
  });
});
