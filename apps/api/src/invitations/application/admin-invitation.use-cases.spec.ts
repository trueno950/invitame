import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { ADMIN_ACTION_REASON } from "../../admin/admin-action-recorder";
import {
  InvitationAlreadyArchivedError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import type {
  AdminInvitationQuery,
  AdminInvitationRepository,
  AdminInvitationRow,
  AdminInvitationUnpublishAudit,
} from "./admin-invitation.repository";
import {
  ADMIN_INVITATION_DETAIL_PAYMENT_LIMIT,
  GetAdminInvitationUseCase,
  InvalidInvitationCursorError,
  ListAdminInvitationsUseCase,
  UnpublishAdminInvitationUseCase,
} from "./admin-invitation.use-cases";
import type { InvitationMediaCountReader, InvitationMediaCounts } from "./invitation-media-counts";
import type { InvitationOwnerEmailReader } from "./invitation-owner-email";
import type { InvitationOwnerStatusReader } from "./invitation-owner-status";
import type {
  InvitationPaymentReader,
  InvitationPaymentSummary,
} from "./invitation-payment-summary";

// The administrator's invitation status view, application layer (M9 T2; S1). Fakes stand in for the four ports, so
// these specs prove the rules the database suites cannot state: key-set paging over equal `createdAt` instants, the
// one batched read per facet for a whole page, the cursor's own contract, the payment bound of the detail read, and
// the exact set of fields the status view answers — which is the privacy rule of S1/L3.

const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";

/** The admin read port over an in-memory table that applies the same filters and order as the Prisma adapter. */
class FakeAdminInvitationRepository implements AdminInvitationRepository {
  readonly rows: AdminInvitationRow[] = [];
  /** Every query the use case asked, so a spec can assert that a refusal read nothing. */
  readonly queries: AdminInvitationQuery[] = [];

  add(overrides: Partial<AdminInvitationRow> = {}): AdminInvitationRow {
    const row: AdminInvitationRow = {
      invitationId: randomUUID(),
      ownerId: OWNER,
      packageId: randomUUID(),
      templateVersionId: randomUUID(),
      slug: `invitacion-${this.rows.length}`,
      status: "DRAFT",
      createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, 0, this.rows.length)),
      publishedAt: null,
      firstPublishedAt: null,
      archivedAt: null,
      refundRequestedAt: null,
      ...overrides,
    };
    this.rows.push(row);
    return row;
  }

  async listForAdmin(query: AdminInvitationQuery): Promise<AdminInvitationRow[]> {
    this.queries.push(query);
    const prefix = query.slugPrefix?.toLowerCase() ?? null;

    return this.rows
      .filter((row) => query.status === null || row.status === query.status)
      .filter((row) => prefix === null || row.slug.toLowerCase().startsWith(prefix))
      .filter(
        (row) =>
          query.after === null ||
          row.createdAt < query.after.createdAt ||
          (row.createdAt.getTime() === query.after.createdAt.getTime() &&
            row.invitationId < query.after.id),
      )
      .sort((left, right) => {
        const byDate = right.createdAt.getTime() - left.createdAt.getTime();
        return byDate === 0 ? (left.invitationId < right.invitationId ? 1 : -1) : byDate;
      })
      .slice(0, query.limit);
  }

  async findForAdmin(invitationId: string): Promise<AdminInvitationRow | null> {
    return this.rows.find((row) => row.invitationId === invitationId) ?? null;
  }

  /** Every unpublish the use case asked, so a spec can assert the audit it carried and the refusals it wrote nothing for. */
  readonly unpublishes: Array<{ invitationId: string; audit: AdminInvitationUnpublishAudit }> = [];
  /** The refusal the port answers instead of a row, when a spec names one. */
  refusal: Error | null = null;

  async unpublishForAdmin(
    invitationId: string,
    audit: AdminInvitationUnpublishAudit,
  ): Promise<AdminInvitationRow | null> {
    this.unpublishes.push({ invitationId, audit });
    if (this.refusal !== null) {
      throw this.refusal;
    }

    const row = this.rows.find((stored) => stored.invitationId === invitationId);
    if (row === undefined) {
      return null;
    }
    row.status = "DRAFT";
    row.publishedAt = null;
    return row;
  }
}

class FakePaymentReader implements InvitationPaymentReader {
  readonly latestCalls: ReadonlyArray<string>[] = [];
  readonly listCalls: Array<{ invitationId: string; limit: number }> = [];
  readonly latest = new Map<string, InvitationPaymentSummary>();
  readonly detail = new Map<string, InvitationPaymentSummary[]>();

  async latestFor(invitationIds: readonly string[]) {
    this.latestCalls.push(invitationIds);
    const found = new Map<string, InvitationPaymentSummary>();
    for (const id of invitationIds) {
      const payment = this.latest.get(id);
      if (payment !== undefined) {
        found.set(id, payment);
      }
    }
    return found;
  }

  async listForInvitation(invitationId: string, limit: number) {
    this.listCalls.push({ invitationId, limit });
    return (this.detail.get(invitationId) ?? []).slice(0, limit);
  }
}

class FakeMediaCountReader implements InvitationMediaCountReader {
  readonly calls: ReadonlyArray<string>[] = [];
  readonly counts = new Map<string, InvitationMediaCounts>();

  async countsFor(invitationIds: readonly string[]) {
    this.calls.push(invitationIds);
    const found = new Map<string, InvitationMediaCounts>();
    for (const id of invitationIds) {
      const counts = this.counts.get(id);
      if (counts !== undefined) {
        found.set(id, counts);
      }
    }
    return found;
  }
}

class FakeOwnerReader implements InvitationOwnerEmailReader {
  readonly calls: ReadonlyArray<string>[] = [];
  readonly emails = new Map<string, string>();

  async emailsFor(ownerIds: readonly string[]) {
    this.calls.push(ownerIds);
    const found = new Map<string, string>();
    for (const id of ownerIds) {
      const email = this.emails.get(id);
      if (email !== undefined) {
        found.set(id, email);
      }
    }
    return found;
  }
}

/** The owner's account state (M9 T9; S4): only the detail asks, once, for its own owner. */
class FakeOwnerStatusReader implements InvitationOwnerStatusReader {
  readonly calls: ReadonlyArray<string>[] = [];
  readonly statuses = new Map<string, "ACTIVE" | "DISABLED">();

  async statusesFor(ownerIds: readonly string[]) {
    this.calls.push(ownerIds);
    const found = new Map<string, "ACTIVE" | "DISABLED">();
    for (const id of ownerIds) {
      const status = this.statuses.get(id);
      if (status !== undefined) {
        found.set(id, status);
      }
    }
    return found;
  }
}

interface Harness {
  repository: FakeAdminInvitationRepository;
  payments: FakePaymentReader;
  media: FakeMediaCountReader;
  owners: FakeOwnerReader;
  ownerStatuses: FakeOwnerStatusReader;
  list: ListAdminInvitationsUseCase;
  detail: GetAdminInvitationUseCase;
  unpublish: UnpublishAdminInvitationUseCase;
}

function harness(): Harness {
  const repository = new FakeAdminInvitationRepository();
  const payments = new FakePaymentReader();
  const media = new FakeMediaCountReader();
  const owners = new FakeOwnerReader();
  const ownerStatuses = new FakeOwnerStatusReader();
  const detail = new GetAdminInvitationUseCase(repository, payments, media, owners, ownerStatuses);

  return {
    repository,
    payments,
    media,
    owners,
    ownerStatuses,
    list: new ListAdminInvitationsUseCase(repository, payments, media, owners),
    detail,
    unpublish: new UnpublishAdminInvitationUseCase(repository, detail),
  };
}

/**
 * The cursor this module writes, built here from a raw instant so a spec can name the stored shape directly —
 * including a canonical instant the encoder would faithfully copy from a `Date` that carries it.
 */
function cursorOf(createdAt: string, id: string = randomUUID()): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

function payment(overrides: Partial<InvitationPaymentSummary> = {}): InvitationPaymentSummary {
  return {
    paymentId: randomUUID(),
    status: "paid",
    amountMinor: 25_000,
    currency: "MXN",
    createdAt: new Date("2026-11-24T10:00:00.000Z"),
    paidAt: new Date("2026-11-24T10:01:00.000Z"),
    ...overrides,
  };
}

describe("ListAdminInvitationsUseCase (M9 T2; S1)", () => {
  it("pages by key-set over equal createdAt instants without repeating or skipping a row", async () => {
    const test = harness();
    const shared = new Date("2026-11-25T12:00:00.000Z");
    // Three rows share one instant: only the id orders them, which is what the cursor must carry.
    for (let index = 0; index < 5; index += 1) {
      test.repository.add({ createdAt: index === 1 || index === 2 ? shared : new Date(0) });
    }
    const seeded = test.repository.rows.map((row) => row.invitationId);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<ListAdminInvitationsUseCase["execute"]>> =
        await test.list.execute({ slug: null, status: null, limit: 2, cursor });
      assert.ok(page.items.length <= 2);
      pages += 1;
      seen.push(...page.items.map((item) => item.invitationId));
      cursor = page.nextCursor;
    } while (cursor !== null);

    assert.equal(pages, 3);
    assert.equal(new Set(seen).size, 5, "no row is repeated across pages");
    assert.deepEqual([...seen].sort(), [...seeded].sort(), "no row is skipped across pages");
    // The order is the port's own `(createdAt desc, id desc)`, so the client sees it unchanged.
    assert.deepEqual(seen, [
      ...test.repository.rows
        .slice()
        .sort((left, right) => {
          const byDate = right.createdAt.getTime() - left.createdAt.getTime();
          return byDate === 0 ? (left.invitationId < right.invitationId ? 1 : -1) : byDate;
        })
        .map((row) => row.invitationId),
    ]);
    assert.equal(test.repository.queries[0]?.after, null);
    assert.notEqual(test.repository.queries[1]?.after, null);
  });

  it("asks the port for one row more than the page, so a full last page answers no cursor", async () => {
    const test = harness();
    test.repository.add();
    test.repository.add();

    const exact = await test.list.execute({ slug: null, status: null, limit: 2, cursor: null });
    const shorter = await test.list.execute({ slug: null, status: null, limit: 3, cursor: null });

    assert.equal(exact.items.length, 2);
    assert.equal(exact.nextCursor, null, "the page is complete, so there is nothing after it");
    assert.equal(shorter.items.length, 2);
    assert.equal(shorter.nextCursor, null);
    assert.equal(test.repository.queries[0]?.limit, 3);
  });

  it("answers an empty page without asking any facet", async () => {
    const test = harness();

    assert.deepEqual(
      await test.list.execute({ slug: null, status: null, limit: 20, cursor: null }),
      {
        items: [],
        nextCursor: null,
      },
    );
    assert.deepEqual(test.payments.latestCalls, []);
    assert.deepEqual(test.media.calls, []);
    assert.deepEqual(test.owners.calls, []);
  });

  it("passes the slug prefix and the status filter to the port unchanged", async () => {
    const test = harness();
    test.repository.add({ slug: "boda-ana" });
    test.repository.add({ slug: "xv-maria" });
    const filtered = test.repository.rows.at(0);
    assert.ok(filtered);

    await test.list.execute({ slug: "bo", status: "DRAFT", limit: 20, cursor: null });

    assert.deepEqual(test.repository.queries[0], {
      slugPrefix: "bo",
      status: "DRAFT",
      after: null,
      limit: 21,
    });
  });

  it("reads payments, media, and owner emails once for the whole page", async () => {
    const test = harness();
    const first = test.repository.add();
    const second = test.repository.add({ ownerId: "22222222-2222-4222-8222-222222222222" });
    const third = test.repository.add();
    test.payments.latest.set(first.invitationId, payment());
    test.media.counts.set(second.invitationId, { mainPhoto: true, galleryCount: 3 });
    test.owners.emails.set(OWNER, "duena@example.test");
    test.owners.emails.set("22222222-2222-4222-8222-222222222222", "otra@example.test");

    const page = await test.list.execute({ slug: null, status: null, limit: 20, cursor: null });

    assert.equal(page.items.length, 3);
    assert.equal(test.payments.latestCalls.length, 1, "one batched payment read per page");
    assert.equal(test.media.calls.length, 1, "one batched media read per page");
    assert.equal(test.owners.calls.length, 1, "one batched owner read per page");
    assert.deepEqual(
      [...(test.payments.latestCalls[0] ?? [])].sort(),
      [first.invitationId, second.invitationId, third.invitationId].sort(),
    );
    assert.deepEqual(
      [...(test.media.calls[0] ?? [])].sort(),
      [first.invitationId, second.invitationId, third.invitationId].sort(),
    );
    assert.deepEqual([...(test.owners.calls[0] ?? [])].sort(), [
      OWNER,
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("answers the contract's exact fields and defaults the facets a row does not have", async () => {
    const test = harness();
    const row = test.repository.add({
      status: "PUBLISHED",
      publishedAt: new Date("2026-11-25T11:00:00.000Z"),
      firstPublishedAt: new Date("2026-11-25T09:00:00.000Z"),
    });
    test.owners.emails.set(OWNER, "duena@example.test");

    const [item] = (await test.list.execute({ slug: null, status: null, limit: 20, cursor: null }))
      .items;
    assert.ok(item);

    assert.deepEqual(Object.keys(item).sort(), [
      "archivedAt",
      "createdAt",
      "firstPublishedAt",
      "invitationId",
      "latestPayment",
      "media",
      "ownerEmail",
      "publishedAt",
      "refundRequestedAt",
      "slug",
      "status",
    ]);
    assert.deepEqual(item, {
      invitationId: row.invitationId,
      slug: row.slug,
      status: "PUBLISHED",
      ownerEmail: "duena@example.test",
      createdAt: row.createdAt,
      publishedAt: new Date("2026-11-25T11:00:00.000Z"),
      firstPublishedAt: new Date("2026-11-25T09:00:00.000Z"),
      archivedAt: null,
      refundRequestedAt: null,
      latestPayment: null,
      media: { mainPhoto: false, galleryCount: 0 },
    });
  });

  it("answers the owner email as null only when no owner row answers", async () => {
    const test = harness();
    test.repository.add();

    const [item] = (await test.list.execute({ slug: null, status: null, limit: 20, cursor: null }))
      .items;

    assert.equal(item?.ownerEmail, null);
  });

  it("answers 400-worthy cursors as an invalid cursor and reads nothing", async () => {
    const invalid = [
      "not base64url!",
      Buffer.from("not json", "utf8").toString("base64url"),
      Buffer.from(JSON.stringify({ createdAt: "2026-11-25", id: randomUUID() })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({ createdAt: "2026-11-25T10:00:00.000Z", id: "not-a-uuid" }),
      ).toString("base64url"),
      Buffer.from(JSON.stringify({ id: randomUUID() })).toString("base64url"),
      Buffer.from(JSON.stringify([])).toString("base64url"),
      "A".repeat(201),
    ];

    for (const cursor of invalid) {
      const test = harness();
      await assert.rejects(
        test.list.execute({ slug: null, status: null, limit: 20, cursor }),
        InvalidInvitationCursorError,
        cursor,
      );
      assert.deepEqual(test.repository.queries, [], cursor);
    }
  });

  it("refuses a canonical instant outside the years a stored createdAt can have, before any read", async () => {
    // PostgreSQL's `timestamptz` spans 4713 BC to 294276 AD, but this product's read only needs the window the cursor
    // module documents (1970..9999). JavaScript accepts every instant below, so without the window each one reaches a
    // query PostgreSQL answers with an error instead of the 400 a malformed cursor earns.
    const refused = [
      "+010000-01-01T00:00:00.000Z", // one second after the last accepted year
      "+275760-09-13T00:00:00.000Z", // JavaScript's own maximum, and PostgreSQL's too
      "1969-12-31T23:59:59.999Z", // one instant before the first accepted year
      "-271821-04-20T00:00:00.000Z", // JavaScript's own minimum
    ];

    for (const createdAt of refused) {
      const test = harness();
      await assert.rejects(
        test.list.execute({ slug: null, status: null, limit: 20, cursor: cursorOf(createdAt) }),
        InvalidInvitationCursorError,
        createdAt,
      );
      assert.deepEqual(test.repository.queries, [], createdAt);
    }
  });

  it("accepts both edges of that window", async () => {
    for (const createdAt of ["1970-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z"]) {
      const test = harness();

      await test.list.execute({ slug: null, status: null, limit: 20, cursor: cursorOf(createdAt) });

      assert.equal(
        test.repository.queries[0]?.after?.createdAt.toISOString(),
        createdAt,
        createdAt,
      );
    }
  });

  it("round-trips its own cursor, so the second page continues after the last row", async () => {
    const test = harness();
    for (const slug of ["uno", "dos", "tres"]) {
      test.repository.add({ slug });
    }

    const first = await test.list.execute({ slug: null, status: null, limit: 2, cursor: null });
    assert.ok(first.nextCursor);
    const second = await test.list.execute({
      slug: null,
      status: null,
      limit: 2,
      cursor: first.nextCursor,
    });

    assert.equal(first.items.length, 2);
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);
    assert.notEqual(second.items[0]?.invitationId, first.items[1]?.invitationId);
  });
});

describe("GetAdminInvitationUseCase (M9 T2; S1)", () => {
  it("answers the detail with the pinned references and the bounded payment list", async () => {
    const test = harness();
    const row = test.repository.add({ status: "ARCHIVED", archivedAt: new Date() });
    test.owners.emails.set(OWNER, "duena@example.test");
    test.ownerStatuses.statuses.set(OWNER, "DISABLED");
    test.media.counts.set(row.invitationId, { mainPhoto: true, galleryCount: 1 });
    test.payments.detail.set(row.invitationId, [
      payment(),
      payment({ status: "pending", paidAt: null }),
    ]);

    const detail = await test.detail.execute(row.invitationId);
    assert.ok(detail);

    assert.deepEqual(Object.keys(detail).sort(), [
      "archivedAt",
      "createdAt",
      "firstPublishedAt",
      "invitationId",
      "latestPayment",
      "media",
      "ownerEmail",
      "ownerId",
      "ownerStatus",
      "packageId",
      "payments",
      "publishedAt",
      "refundRequestedAt",
      "slug",
      "status",
      "templateVersionId",
    ]);
    // The support card's one additive field (T9; S4): the owner's stored status, read once for the detail's owner.
    assert.equal(detail.ownerStatus, "DISABLED");
    assert.deepEqual(test.ownerStatuses.calls, [[row.ownerId]]);
    assert.equal(detail.packageId, row.packageId);
    assert.equal(detail.templateVersionId, row.templateVersionId);
    assert.deepEqual(
      detail.payments.map((one) => one.paymentId),
      (test.payments.detail.get(row.invitationId) ?? []).map((one) => one.paymentId),
    );
    assert.ok(
      (test.payments.detail.get(row.invitationId) ?? []).every((one) =>
        Object.keys(one).every((key) =>
          ["amountMinor", "createdAt", "currency", "paidAt", "paymentId", "status"].includes(key),
        ),
      ),
    );
    assert.equal(test.payments.listCalls[0]?.limit, ADMIN_INVITATION_DETAIL_PAYMENT_LIMIT);
  });

  it("answers null for an id no row has, so the route answers one 404", async () => {
    const test = harness();

    assert.equal(await test.detail.execute(randomUUID()), null);
  });

  it("never answers invitation content or the owner's display name", async () => {
    const test = harness();
    const row = test.repository.add();
    test.owners.emails.set(OWNER, "duena@example.test");

    const detail = await test.detail.execute(row.invitationId);

    assert.ok(detail);
    assert.equal("content" in detail, false);
    assert.equal("ownerDisplayName" in detail, false);
    // The additive `ownerId` (T8; S4) is the one owner reference the page needs to address the account; the address
    // itself is still the only owner text the view answers (L3).
    assert.equal(detail.ownerId, row.ownerId);
    assert.equal(detail.ownerEmail, "duena@example.test");
    assert.equal("guests" in detail, false);
    assert.equal("rsvpResponses" in detail, false);
  });
});

describe("UnpublishAdminInvitationUseCase (M9 T8; S4, S6)", () => {
  it("asks the port for the transition with the actor, the reason, and the note, and answers the new detail", async () => {
    const test = harness();
    const publishedAt = new Date("2026-11-24T10:00:00.000Z");
    const row = test.repository.add({
      slug: "boda-ana",
      status: "PUBLISHED",
      publishedAt,
      firstPublishedAt: publishedAt,
    });
    test.owners.emails.set(OWNER, "duena@example.test");
    test.payments.detail.set(row.invitationId, [payment()]);
    test.media.counts.set(row.invitationId, { mainPhoto: true, galleryCount: 2 });

    const detail = await test.unpublish.execute({
      invitationId: row.invitationId,
      adminUserId: ADMIN_ID,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      note: "La dueña lo pidió por correo.",
    });

    assert.deepEqual(test.repository.unpublishes, [
      {
        invitationId: row.invitationId,
        audit: {
          adminUserId: ADMIN_ID,
          reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
          note: "La dueña lo pidió por correo.",
        },
      },
    ]);
    assert.ok(detail);
    assert.equal(detail.invitationId, row.invitationId);
    assert.equal(detail.status, "DRAFT");
    assert.equal(detail.publishedAt, null);
    // Unpublishing returns the invitation to a draft; the first publication stays the invitation's history (S3).
    assert.equal(detail.firstPublishedAt?.getTime(), publishedAt.getTime());
    assert.equal(detail.ownerId, OWNER);
    assert.equal(detail.ownerEmail, "duena@example.test");
    assert.equal(detail.payments.length, 1);
    assert.deepEqual(detail.media, { mainPhoto: true, galleryCount: 2 });
  });

  it("answers null, and reads no facet, for an id no invitation has", async () => {
    const test = harness();

    assert.equal(
      await test.unpublish.execute({
        invitationId: randomUUID(),
        adminUserId: ADMIN_ID,
        reason: ADMIN_ACTION_REASON.ABUSE,
        note: null,
      }),
      null,
    );
    assert.deepEqual(test.payments.listCalls, []);
    assert.deepEqual(test.media.calls, []);
  });

  it("lets the port's refusal through unchanged, so the route can answer its own conflict", async () => {
    for (const refusal of [
      new InvitationNotPublishedError(),
      new InvitationAlreadyArchivedError(),
    ]) {
      const test = harness();
      test.repository.refusal = refusal;

      await assert.rejects(
        test.unpublish.execute({
          invitationId: randomUUID(),
          adminUserId: ADMIN_ID,
          reason: ADMIN_ACTION_REASON.PAYMENT_ERROR,
          note: null,
        }),
        (error: unknown) => error === refusal,
      );
      assert.deepEqual(test.payments.listCalls, [], "a refused unpublish reads no payment");
      assert.deepEqual(test.media.calls, [], "a refused unpublish reads no photo count");
    }
  });
});
