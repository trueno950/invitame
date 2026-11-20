import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_INVITATION_LIST_LIMIT } from "../../server/admin-invitations-client.ts";
import { INVITATIONS_COPY, INVITATIONS_PATHS, INVITATION_STATUS_FILTER_LABELS } from "./copy.ts";
import {
  hasInvitationFilters,
  invitationListQuery,
  MAX_SLUG_FILTER_LENGTH,
  nextPageHref,
  parseInvitationFilters,
} from "./search.ts";

// The filters of `/admin/invitaciones` (M9 T3; S1): the page validates its own query before any call reaches the API, so
// a bad or forged value is shown as no filter and never becomes an API request. `estado` is the page's closed set of
// Spanish values, mapped to the API's stored status; `cursor` is passed through only when it could be the API's
// opaque base64url token.

const CURSOR = "eyJjcmVhdGVkQXQiOiIyMDI2LTExLTEwVDEwOjAwOjAwLjAwMFoiLCJpZCI6IjFiNmY" + "zZTBjIn0";

describe("parseInvitationFilters", () => {
  it("reads no filter from an empty query", () => {
    assert.deepEqual(parseInvitationFilters({}), {});
    assert.deepEqual(parseInvitationFilters({ slug: "", estado: "", cursor: "" }), {});
  });

  it("trims the slug prefix and keeps a whole one", () => {
    assert.deepEqual(parseInvitationFilters({ slug: "  ana-y  " }), { slug: "ana-y" });
    assert.deepEqual(parseInvitationFilters({ slug: "a".repeat(MAX_SLUG_FILTER_LENGTH) }), {
      slug: "a".repeat(MAX_SLUG_FILTER_LENGTH),
    });
    assert.equal(MAX_SLUG_FILTER_LENGTH, 60);
  });

  it("shows a slug that could not be a prefix of a real slug as no filter", () => {
    for (const slug of [
      "   ",
      "a".repeat(MAX_SLUG_FILTER_LENGTH + 1),
      "ana y daniel",
      "<script>",
      "ana_y",
      "ana.y",
      "ana/../daniel",
    ]) {
      assert.deepEqual(parseInvitationFilters({ slug }), {}, slug);
    }
  });

  it("maps each estado of the page's closed set to the API's stored status", () => {
    const cases: Array<[string, string]> = [
      ["borrador", "DRAFT"],
      ["publicada", "PUBLISHED"],
      ["archivada", "ARCHIVED"],
    ];

    for (const [estado, status] of cases) {
      assert.deepEqual(parseInvitationFilters({ estado }), { estado }, estado);
      assert.equal(invitationListQuery({ estado: estado as "borrador" }).status, status, estado);
      assert.ok(Object.hasOwn(INVITATION_STATUS_FILTER_LABELS, estado), estado);
    }
  });

  it("shows an estado outside the set as no filter", () => {
    for (const estado of ["DRAFT", "PUBLISHED", "publicado", "todas", "borrador ", "0"]) {
      assert.deepEqual(parseInvitationFilters({ estado }), {}, estado);
    }
  });

  it("passes a plausible cursor through and drops anything that is not one", () => {
    assert.deepEqual(parseInvitationFilters({ cursor: CURSOR }), { cursor: CURSOR });

    for (const cursor of ["abc def", "abc+def", "abc/def=", "../admin", "a".repeat(201)]) {
      assert.deepEqual(parseInvitationFilters({ cursor }), {}, cursor);
    }
  });

  it("reads a value only when the query carries it once, as text", () => {
    assert.deepEqual(parseInvitationFilters({ slug: ["ana", "daniel"] }), {});
    assert.deepEqual(parseInvitationFilters({ estado: ["borrador", "publicada"] }), {});
    assert.deepEqual(parseInvitationFilters({ cursor: [CURSOR, CURSOR] }), {});
    assert.deepEqual(parseInvitationFilters({ slug: ["ana"] }), { slug: "ana" });
  });

  it("reads the three filters together", () => {
    assert.deepEqual(
      parseInvitationFilters({ slug: " ana-y ", estado: "publicada", cursor: CURSOR }),
      { slug: "ana-y", estado: "publicada", cursor: CURSOR },
    );
  });
});

describe("invitationListQuery", () => {
  it("asks for the bounded first page when nothing is filtered", () => {
    assert.deepEqual(invitationListQuery({}), {});
    assert.equal(ADMIN_INVITATION_LIST_LIMIT, 20);
  });

  it("sends the slug, the API status, and the cursor the parser accepted", () => {
    assert.deepEqual(invitationListQuery({ slug: "ana-y", estado: "archivada", cursor: CURSOR }), {
      slug: "ana-y",
      status: "ARCHIVED",
      cursor: CURSOR,
    });
  });
});

describe("nextPageHref", () => {
  it("carries the cursor and the filters the page is showing", () => {
    assert.equal(
      nextPageHref({ slug: "ana-y", estado: "publicada" }, CURSOR),
      `${INVITATIONS_PATHS.index}?slug=ana-y&estado=publicada&cursor=${CURSOR}`,
    );
  });

  it("links the plain index when there is no filter", () => {
    assert.equal(nextPageHref({}, CURSOR), `${INVITATIONS_PATHS.index}?cursor=${CURSOR}`);
  });

  it("offers no next page for a cursor the page would refuse to read back", () => {
    assert.equal(nextPageHref({}, "not a cursor"), undefined);
    assert.equal(nextPageHref({}, ""), undefined);
  });

  it("keeps the index path and the filter names stable", () => {
    assert.equal(INVITATIONS_PATHS.index, "/admin/invitaciones");
    assert.match(INVITATIONS_COPY.statusLabel, /Estado/);
  });
});

describe("hasInvitationFilters", () => {
  it("tells an unfiltered list from a filtered one", () => {
    assert.equal(hasInvitationFilters({}), false);
    assert.equal(hasInvitationFilters({ cursor: CURSOR }), false);
    assert.equal(hasInvitationFilters({ slug: "ana" }), true);
    assert.equal(hasInvitationFilters({ estado: "borrador" }), true);
  });
});
