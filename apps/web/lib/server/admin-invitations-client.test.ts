import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  ADMIN_INVITATION_LIST_LIMIT,
  createAdminInvitationsClient,
  isInvitationCursor,
} from "./admin-invitations-client.ts";
import { ApiClientError } from "./api-client.ts";

// The web server's client of the administrator invitations API (M9 T3; S1). A real local HTTP server stands in for the
// API: the client forwards only Better Auth's cookies and the proxy secret, asks for the bounded search with its
// filters and key-set cursor, reads one invitation's status, maps each documented refusal to a typed outcome, and
// fails closed on anything else without keeping a response body. The contract mirrors `GET /admin/invitations` and
// `GET /admin/invitations/:invitationId` of `odd/tasks/m9-admin-operations.md`, Design (S1).

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const PAYMENT_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const PACKAGE_ID = "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12";
const TEMPLATE_VERSION_ID = "3b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e13";
/** The owner's id, the additive reference of T8 the support card needs to address the account. */
const OWNER_ID = "9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19";
const CREATED_AT = "2026-11-10T10:00:00.000Z";
const PUBLISHED_AT = "2026-11-12T10:00:00.000Z";
/** The API's own key-set cursor: opaque base64url of `createdAt` and `id`. */
const CURSOR = "eyJjcmVhdGVkQXQiOiIyMDI2LTExLTEwVDEwOjAwOjAwLjAwMFoiLCJpZCI6IjFiNmY" + "zZTBjIn0";

const INVITATION = {
  invitationId: INVITATION_ID,
  slug: "ana-y-daniel",
  status: "PUBLISHED",
  ownerEmail: "ana@ejemplo.com",
  createdAt: CREATED_AT,
  publishedAt: PUBLISHED_AT,
  firstPublishedAt: PUBLISHED_AT,
  archivedAt: null,
  refundRequestedAt: null,
  latestPayment: {
    status: "paid",
    amountMinor: 150000,
    currency: "MXN",
    paidAt: PUBLISHED_AT,
  },
  media: { mainPhoto: true, galleryCount: 3 },
};

const PAYMENT = {
  paymentId: PAYMENT_ID,
  status: "paid",
  amountMinor: 150000,
  currency: "MXN",
  createdAt: CREATED_AT,
  paidAt: PUBLISHED_AT,
};

const DETAIL = {
  ...INVITATION,
  ownerId: OWNER_ID,
  // The owner's stored account status (T9; S4): the support card reads it to offer disable or reactivate.
  ownerStatus: "ACTIVE",
  packageId: PACKAGE_ID,
  templateVersionId: TEMPLATE_VERSION_ID,
  payments: [PAYMENT],
};

/** The additive analytics fields of the detail (T12; S2, S7): aperturas of the last 90 days and the RSVP totals. */
const VIEWS = { public: 12, guest: 3 };
const RSVP_TOTALS = { attendingPeople: 48, declined: 9, responses: 21 };
const DETAIL_WITH_ANALYTICS = { ...DETAIL, views: VIEWS, rsvpTotals: RSVP_TOTALS };
/**
 * The detail as the client hands it to a page: without the analytics fields, the two additive ones read as `null`, so
 * the invitation page keeps working before the API lands.
 */
const PARSED_DETAIL = { ...DETAIL, views: null, rsvpTotals: null };
const PARSED_DETAIL_WITH_ANALYTICS = { ...DETAIL, views: VIEWS, rsvpTotals: RSVP_TOTALS };

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let apiOrigin = "";
let received: Received[] = [];
let respond: (request: Received, response: ServerResponse) => void = () => {};
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const entry: Received = {
      method: request.method ?? "",
      url: request.url ?? "",
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    received.push(entry);
    respond(entry, response);
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function answer(status: number, body: unknown) {
  respond = (_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  };
}

beforeEach(() => {
  received = [];
  answer(200, { items: [INVITATION], nextCursor: CURSOR });
});

function client(
  cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`,
  origin: string = apiOrigin,
) {
  return createAdminInvitationsClient(
    {
      config: {
        apiOrigin: origin,
        publicWebOrigin: undefined,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    },
    async () => cookie,
  );
}

describe("requests", () => {
  it("reads the newest page with the API's default limit, the session cookie, and the secret", async () => {
    assert.deepEqual(await client().list(), {
      ok: true,
      value: { items: [INVITATION], nextCursor: CURSOR },
    });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(ADMIN_INVITATION_LIST_LIMIT, 20);
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, "/admin/invitations?limit=20");
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("encodes the slug prefix, the status, and the cursor as the API's query", async () => {
    await client().list({ slug: "ana y", status: "DRAFT", cursor: CURSOR });

    assert.equal(
      received[0]?.url,
      `/admin/invitations?slug=ana+y&status=DRAFT&limit=20&cursor=${CURSOR}`,
    );
  });

  it("leaves out every filter the page did not set", async () => {
    await client().list({ slug: "ana-y", status: "ARCHIVED" });

    assert.equal(received[0]?.url, "/admin/invitations?slug=ana-y&status=ARCHIVED&limit=20");
  });

  it("reads one invitation's status detail by id", async () => {
    answer(200, DETAIL);

    assert.deepEqual(await client().detail(INVITATION_ID), { ok: true, value: PARSED_DETAIL });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, `/admin/invitations/${INVITATION_ID}`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("accepts an empty page with no next cursor", async () => {
    answer(200, { items: [], nextCursor: null });

    assert.deepEqual(await client().list(), { ok: true, value: { items: [], nextCursor: null } });
  });

  it("accepts an invitation whose owner address the API answers as unknown", async () => {
    const unknownOwner = { ...INVITATION, ownerEmail: null };
    answer(200, { items: [unknownOwner], nextCursor: null });

    assert.deepEqual(await client().list(), {
      ok: true,
      value: { items: [unknownOwner], nextCursor: null },
    });
  });

  it("never keeps the invitation content, the owner's name, or guest data the API does not send", async () => {
    const extra = {
      content: { title: "Ana y Daniel", message: "Acompáñanos" },
      ownerDisplayName: "Ana",
      guests: [{ name: "Luis", answer: "yes" }],
      rsvpAnswers: ["yes"],
    };
    answer(200, { items: [{ ...INVITATION, ...extra }], nextCursor: null });

    assert.deepEqual(await client().list(), {
      ok: true,
      value: { items: [INVITATION], nextCursor: null },
    });

    answer(200, { ...DETAIL, ...extra });
    assert.deepEqual(await client().detail(INVITATION_ID), { ok: true, value: PARSED_DETAIL });
  });

  it("keeps the owner's id out of the list, which still answers the email only (S1, L3)", async () => {
    // The detail's additive `ownerId` (T8; S4) is not a summary field: the list the pages already render keeps exactly
    // the shape it had, even if a future API answered the identifier there by accident.
    answer(200, { items: [{ ...INVITATION, ownerId: OWNER_ID }], nextCursor: null });

    assert.deepEqual(await client().list(), {
      ok: true,
      value: { items: [INVITATION], nextCursor: null },
    });
  });

  it("keeps the owner's account status in the detail, and only there (T9; S4)", async () => {
    answer(200, DETAIL);
    const detail = await client().detail(INVITATION_ID);
    assert.ok(detail.ok);
    assert.equal(detail.value.ownerStatus, "ACTIVE");

    answer(200, { ...DETAIL, ownerStatus: "DISABLED" });
    const disabled = await client().detail(INVITATION_ID);
    assert.ok(disabled.ok);
    assert.equal(disabled.value.ownerStatus, "DISABLED");

    // No stored owner answers: the detail says so instead of inventing a state.
    answer(200, { ...DETAIL, ownerStatus: null });
    const unknown = await client().detail(INVITATION_ID);
    assert.ok(unknown.ok);
    assert.equal(unknown.value.ownerStatus, null);

    // A list row still answers no owner status: the status view keeps «solo el correo» (L3).
    answer(200, { items: [{ ...INVITATION, ownerStatus: "ACTIVE" }], nextCursor: null });
    const page = await client().list();
    assert.ok(page.ok);
    assert.equal("ownerStatus" in (page.value.items[0] ?? {}), false);
  });

  it("keeps the aperturas and RSVP totals of the detail, and only there (T12; S2, S7)", async () => {
    answer(200, DETAIL_WITH_ANALYTICS);
    const detail = await client().detail(INVITATION_ID);
    assert.deepEqual(detail, { ok: true, value: PARSED_DETAIL_WITH_ANALYTICS });

    // A list row keeps exactly the shape it had: the analytics of one invitation are not a list field.
    answer(200, {
      items: [{ ...INVITATION, views: VIEWS, rsvpTotals: RSVP_TOTALS }],
      nextCursor: null,
    });
    const page = await client().list();
    assert.ok(page.ok);
    assert.equal("views" in (page.value.items[0] ?? {}), false);
    assert.equal("rsvpTotals" in (page.value.items[0] ?? {}), false);
  });

  it("accepts a detail without the additive analytics fields, which the page then renders nothing for", async () => {
    // The API answers neither field until its analytics slice lands: the detail is still the contract it was, and the
    // two fields read as `null` so the invitation page renders no aperturas card instead of failing.
    answer(200, DETAIL);
    const detail = await client().detail(INVITATION_ID);
    assert.ok(detail.ok);
    assert.equal(detail.value.views, null);
    assert.equal(detail.value.rsvpTotals, null);

    // Each field is additive on its own: one answered, the other still absent.
    answer(200, { ...DETAIL, views: VIEWS });
    const partial = await client().detail(INVITATION_ID);
    assert.deepEqual(partial, { ok: true, value: { ...PARSED_DETAIL, views: VIEWS } });

    answer(200, { ...DETAIL, rsvpTotals: RSVP_TOTALS });
    const other = await client().detail(INVITATION_ID);
    assert.deepEqual(other, { ok: true, value: { ...PARSED_DETAIL, rsvpTotals: RSVP_TOTALS } });
  });

  it("fails closed on analytics fields outside their contract", async () => {
    const bodies: unknown[] = [
      { ...DETAIL, views: null },
      { ...DETAIL, views: [] },
      { ...DETAIL, views: { public: 1 } },
      { ...DETAIL, views: { public: -1, guest: 0 } },
      { ...DETAIL, views: { public: 1.5, guest: 0 } },
      { ...DETAIL, views: { public: "1", guest: 0 } },
      { ...DETAIL, rsvpTotals: null },
      { ...DETAIL, rsvpTotals: { attendingPeople: 1, declined: 0 } },
      { ...DETAIL, rsvpTotals: { attendingPeople: 1, declined: -1, responses: 0 } },
      { ...DETAIL, rsvpTotals: { attendingPeople: 1, declined: 0, responses: 0.5 } },
    ];

    for (const body of bodies) {
      answer(200, body);
      await assert.rejects(
        client().detail(INVITATION_ID),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(body),
      );
    }
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    for (const cookie of [null, "", "theme=dark"]) {
      const api = client(cookie);
      assert.deepEqual(await api.list(), { ok: false, failure: "signed-out" });
      assert.deepEqual(await api.detail(INVITATION_ID), { ok: false, failure: "signed-out" });
    }
    assert.equal(received.length, 0);
  });

  it("answers not found without calling the API when the invitation id is not a UUID", async () => {
    const api = client();
    for (const id of [
      "",
      "x",
      "../invitations",
      `${INVITATION_ID}/payments`,
      `${INVITATION_ID}?a=1`,
    ]) {
      assert.deepEqual(await api.detail(id), { ok: false, failure: "not-found" }, id);
    }
    assert.equal(received.length, 0);
  });

  it("fails closed on a summary outside the contract", async () => {
    for (const row of [
      { ...INVITATION, status: "active" },
      { ...INVITATION, invitationId: "no-es-un-uuid" },
      { ...INVITATION, slug: "" },
      { ...INVITATION, slug: "Ana y Daniel" },
      { ...INVITATION, ownerEmail: "" },
      { ...INVITATION, ownerEmail: 42 },
      { ...INVITATION, createdAt: "ayer" },
      { ...INVITATION, publishedAt: "ayer" },
      { ...INVITATION, archivedAt: undefined },
      { ...INVITATION, media: { mainPhoto: true, galleryCount: -1 } },
      { ...INVITATION, media: { mainPhoto: true, galleryCount: 1.5 } },
      { ...INVITATION, media: { mainPhoto: "yes", galleryCount: 0 } },
      { ...INVITATION, media: { galleryCount: 0 } },
      { ...INVITATION, latestPayment: { status: "approved", amountMinor: 1 } },
      {
        ...INVITATION,
        latestPayment: { status: "paid", amountMinor: -1, currency: "MXN", paidAt: null },
      },
      {
        ...INVITATION,
        latestPayment: { status: "paid", amountMinor: 1, currency: "", paidAt: null },
      },
      {
        ...INVITATION,
        latestPayment: { status: "paid", amountMinor: 1, currency: "MXN", paidAt: "ayer" },
      },
      { ...INVITATION, latestPayment: undefined },
      { ...INVITATION, invitationId: undefined },
    ]) {
      answer(200, { items: [row], nextCursor: null });
      await assert.rejects(
        client().list(),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(row),
      );
    }
  });

  it("fails closed on a page or a cursor outside the contract", async () => {
    for (const body of [
      [INVITATION],
      { items: [INVITATION] },
      { items: INVITATION, nextCursor: null },
      { items: [INVITATION], nextCursor: 42 },
      { items: [INVITATION], nextCursor: "not base64url!" },
      { items: [INVITATION], nextCursor: "" },
    ]) {
      answer(200, body);
      await assert.rejects(
        client().list(),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(body),
      );
    }
  });

  it("fails closed on a detail outside the contract", async () => {
    for (const body of [
      { ...DETAIL, packageId: "no-es-un-uuid" },
      { ...DETAIL, templateVersionId: undefined },
      { ...DETAIL, ownerId: undefined },
      { ...DETAIL, ownerId: "no-es-un-uuid" },
      { ...DETAIL, ownerId: null },
      { ...DETAIL, ownerStatus: "SUSPENDED" },
      { ...DETAIL, ownerStatus: undefined },
      { ...DETAIL, payments: undefined },
      { ...DETAIL, payments: [{ ...PAYMENT, paymentId: "x" }] },
      { ...DETAIL, payments: [{ ...PAYMENT, status: "approved" }] },
      { ...DETAIL, payments: [{ ...PAYMENT, amountMinor: 1.5 }] },
      { ...DETAIL, payments: [{ ...PAYMENT, createdAt: null }] },
      { ...DETAIL, payments: [{ ...PAYMENT, paidAt: "ayer" }] },
    ]) {
      answer(200, body);
      await assert.rejects(
        client().detail(INVITATION_ID),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(body),
      );
    }
  });

  it("fails closed on a body that is not JSON", async () => {
    answer(200, "<html>not json</html>");
    await assert.rejects(
      client().list(),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });
});

describe("the outcomes the page handles", () => {
  it("maps 401, 403, 404, and a 400 the API answers", async () => {
    const cases: Array<[number, string]> = [
      [401, "signed-out"],
      [403, "forbidden"],
      [400, "validation"],
    ];
    for (const [status, failure] of cases) {
      answer(status, { message: "detail", statusCode: status });
      assert.deepEqual(await client().list(), { ok: false, failure }, String(status));
    }

    answer(404, { code: "INVITATION_NOT_FOUND", statusCode: 404 });
    assert.deepEqual(await client().detail(INVITATION_ID), { ok: false, failure: "not-found" });
  });

  it("maps a 404 that carries no code to not found", async () => {
    answer(404, { message: "Not Found", statusCode: 404 });
    assert.deepEqual(await client().detail(INVITATION_ID), { ok: false, failure: "not-found" });
  });

  it("answers unavailable on a 5xx without reading the refusal body", async () => {
    for (const status of [500, 502, 503]) {
      answer(status, { code: "INTERNAL_ERROR", detail: "no debe leerse" });
      assert.deepEqual(
        await client().list(),
        { ok: false, failure: "unavailable" },
        String(status),
      );
      assert.deepEqual(
        await client().detail(INVITATION_ID),
        { ok: false, failure: "unavailable" },
        String(status),
      );
    }
  });

  it("answers unavailable when the API cannot be reached", async () => {
    const api = client(undefined, "http://127.0.0.1:1");
    assert.deepEqual(await api.list(), { ok: false, failure: "unavailable" });
  });

  it("treats an unknown refusal code, other 4xx, and redirects as rejected", async () => {
    for (const [status, body] of [
      [409, { code: "INVITATION_ALREADY_PUBLISHED" }],
      [422, { message: "unprocessable" }],
      [302, {}],
    ] as Array<[number, unknown]>) {
      answer(status, body);
      await assert.rejects(
        client().list(),
        (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
        String(status),
      );
    }
  });
});

describe("isInvitationCursor", () => {
  it("accepts the API's base64url cursor and refuses anything else", () => {
    assert.equal(isInvitationCursor(CURSOR), true);
    for (const value of ["", "a b", "abc+def", "abc/def=", "../x", "a".repeat(201), 42, null]) {
      assert.equal(isInvitationCursor(value), false, String(value));
    }
  });
});

describe("the admin unpublish (M9 T8; S4, S6)", () => {
  it("posts the administrator's reason and note, and reads the new detail", async () => {
    answer(200, { ...DETAIL, status: "DRAFT", publishedAt: null });

    assert.deepEqual(
      await client().unpublish(INVITATION_ID, {
        reason: "OWNER_REQUEST",
        note: "La dueña lo pidió por correo.",
      }),
      { ok: true, value: { ...PARSED_DETAIL, status: "DRAFT", publishedAt: null } },
    );

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, `/admin/invitations/${INVITATION_ID}/unpublish`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.match(request?.headers["content-type"] ?? "", /^application\/json/);
    assert.deepEqual(JSON.parse(request?.body ?? ""), {
      reason: "OWNER_REQUEST",
      note: "La dueña lo pidió por correo.",
    });
  });

  it("leaves the note out when the administrator wrote none", async () => {
    answer(200, { ...DETAIL, status: "DRAFT", publishedAt: null });

    await client().unpublish(INVITATION_ID, { reason: "ABUSE", note: null });

    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), { reason: "ABUSE" });
  });

  it("maps each refusal to its own outcome", async () => {
    const cases: Array<[number, unknown, string]> = [
      [404, { code: "INVITATION_NOT_FOUND" }, "not-found"],
      [409, { code: "INVITATION_NOT_PUBLISHED" }, "not-published"],
      [409, { code: "INVITATION_ALREADY_ARCHIVED" }, "already-archived"],
      [400, { message: "Bad Request", statusCode: 400 }, "validation"],
      [403, { message: "Forbidden", statusCode: 403 }, "forbidden"],
    ];

    for (const [status, body, failure] of cases) {
      answer(status, body);
      assert.deepEqual(
        await client().unpublish(INVITATION_ID, { reason: "ABUSE", note: null }),
        { ok: false, failure },
        `${status} ${JSON.stringify(body)}`,
      );
    }
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    assert.deepEqual(await client(null).unpublish(INVITATION_ID, { reason: "ABUSE", note: null }), {
      ok: false,
      failure: "signed-out",
    });
    assert.equal(received.length, 0);
  });

  it("answers not found without calling the API when the invitation id is not a UUID", async () => {
    for (const id of ["", "x", "../invitations", `${INVITATION_ID}/payments`]) {
      assert.deepEqual(await client().unpublish(id, { reason: "ABUSE", note: null }), {
        ok: false,
        failure: "not-found",
      });
    }
    assert.equal(received.length, 0);
  });

  it("answers unavailable on a 5xx and when the API cannot be reached", async () => {
    answer(503, { code: "INTERNAL_ERROR" });
    assert.deepEqual(await client().unpublish(INVITATION_ID, { reason: "ABUSE", note: null }), {
      ok: false,
      failure: "unavailable",
    });

    assert.deepEqual(
      await client(undefined, "http://127.0.0.1:1").unpublish(INVITATION_ID, {
        reason: "ABUSE",
        note: null,
      }),
      { ok: false, failure: "unavailable" },
    );
  });

  it("fails closed on a success whose body is not the detail contract", async () => {
    answer(200, { ...DETAIL, ownerId: undefined });
    await assert.rejects(
      client().unpublish(INVITATION_ID, { reason: "ABUSE", note: null }),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });

  it("treats a 409 code it does not know as rejected", async () => {
    answer(409, { code: "INVITATION_ALREADY_PUBLISHED" });
    await assert.rejects(
      client().unpublish(INVITATION_ID, { reason: "ABUSE", note: null }),
      (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
    );
  });
});
