import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@prisma/client";

import { PrismaAdminInvitationRepository } from "./prisma-admin-invitation.repository";

// The detail read's identifier (M9 T2, T5; S1). The route validates the parameter as a UUID, so a malformed id never
// arrives over HTTP today; the use case and the repository can still be called with one (a command, a later route, a
// future internal caller), and PostgreSQL would refuse the comparison with a database error. The repository answers
// null — the same "no row" the route maps to its one 404 — and never sends the statement.

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";

/** A Prisma client whose only used method records the id it was given and answers no row. */
function fakePrisma(): { client: PrismaClient; reads: string[] } {
  const reads: string[] = [];
  const client = {
    invitation: {
      findUnique: async (args: { where: { id: string } }) => {
        reads.push(args.where.id);
        return null;
      },
    },
  } as unknown as PrismaClient;

  return { client, reads };
}

describe("PrismaAdminInvitationRepository detail read (M9 T2, T5; S1)", () => {
  it("answers null for an id that is not a UUID, without querying", async () => {
    const { client, reads } = fakePrisma();
    const repository = new PrismaAdminInvitationRepository(client);

    for (const id of ["not-a-uuid", "", "1111", `${INVITATION_ID}-x`]) {
      assert.equal(await repository.findForAdmin(id), null, id);
    }
    assert.deepEqual(reads, [], "a malformed id costs no query");
  });

  it("still reads a stored id through the client", async () => {
    const { client, reads } = fakePrisma();
    const repository = new PrismaAdminInvitationRepository(client);

    assert.equal(await repository.findForAdmin(INVITATION_ID), null);
    assert.deepEqual(reads, [INVITATION_ID]);
  });
});
