import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@prisma/client";

import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// The one rule of `listSharedWith` PostgreSQL cannot hold (F12; L17.5). The stored permission set is an enum array, so a
// value the domain's allow-list does not know cannot be written yet — the day the enum gains a permission the API's
// allow-list does not know, it can. That row must read as no access at all, exactly like a collaborator whose row grants
// nothing: the list answers what the allow-list knows, never what a row happens to hold. The rest of the method — accepted
// only, non-revoked only, never the caller's own, the order — is proved against real PostgreSQL by
// `prisma-invitation.repository.db-spec.ts`; here the adapter is handed the rows that database cannot produce.

const USER = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";

/** One row as `findMany` returns it, with the stored set the case needs and nothing else in play. */
function row(id: string, permissions: readonly string[]) {
  return {
    id,
    ownerId: OWNER,
    templateVersionId: "33333333-3333-4333-8333-333333333333",
    packageId: "44444444-4444-4444-8444-444444444444",
    slug: `invitacion-${id.slice(0, 6)}`,
    status: "DRAFT",
    content: {},
    timeZone: "America/Mexico_City",
    rsvpDeadline: null,
    rsvpPartyLimit: 4,
    archivedAt: null,
    publishedAt: null,
    firstPublishedAt: null,
    expiresAt: null,
    createdAt: new Date("2026-12-14T12:00:00.000Z"),
    updatedAt: new Date("2026-12-14T12:00:00.000Z"),
    featureSettings: null,
    places: [],
    // The caller's own accepted row, exactly as the selecting `where` narrows it.
    collaborators: [{ permissions }],
  };
}

function repositoryAnswering(rows: readonly unknown[]): PrismaInvitationRepository {
  return new PrismaInvitationRepository({
    invitation: { findMany: async () => rows },
  } as unknown as PrismaClient);
}

describe("listSharedWith over a stored permission set (F12; L17.5)", () => {
  it("drops an invitation whose stored set grants no permission the domain knows", async () => {
    const repository = repositoryAnswering([row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ["PAY"])]);

    assert.deepEqual(await repository.listSharedWith(USER), []);
  });

  it("keeps the known permissions of a mixed set, in the domain's canonical order", async () => {
    const repository = repositoryAnswering([
      row("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ["PUBLISH", "PAY", "EDIT_CONTENT"]),
    ]);

    const [shared] = await repository.listSharedWith(USER);

    assert.deepEqual(shared?.permissions, ["EDIT_CONTENT", "PUBLISH"]);
    assert.equal(shared?.id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});
