import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createInvitationsClient,
  isInvitationId,
  parseCheckout,
  parseCreatorPackages,
  parseCreatorTemplates,
  parseInvitationListItems,
  parseInvitationPayment,
  parseInvitationSummaries,
  parseOwnedInvitation,
  parsePlaceSuggestions,
  parseGuestAlbumRead,
  parseGuestPhoto,
  parseRsvpRead,
  parseRsvpSettings,
} from "./invitations-api.ts";

// The web server's client of the invitation API (M4 T5; S1, S6, S7). A real local HTTP server stands in
// for the API: the client forwards only Better Auth's cookies and the proxy secret, maps each documented
// status and code to a typed outcome, and fails closed on anything else without keeping a response body.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const VERSION_ID = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const PACKAGE_ID = "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15";
const AT = "2026-11-11T12:00:00.000Z";

const SUMMARY = {
  id: ID,
  templateVersionId: VERSION_ID,
  packageId: PACKAGE_ID,
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  publishedAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
};

/** One row of `GET /invitations`: the summary plus what its card renders it from (T2; S2.6). */
const LIST_ITEM = {
  ...SUMMARY,
  content: { celebrantName: "Ana", date: "2026-12-05" },
  componentKey: "birthday-poster-01",
  configuration: { componentKey: "birthday-poster-01" },
};

const OWNED = {
  ...SUMMARY,
  content: { celebrantName: "Ana", age: 7 },
  missingRequiredFields: ["date", "time"],
  timeZone: "America/Mexico_City",
  featureSettings: {
    whatsappPhone: null,
    playlistUrl: null,
    playlistTitle: null,
    playlistCoverUrl: null,
    // The plan of the day the owner read carries (F1; L3.1); null while the invitation has none.
    itinerary: null,
    giftRegistry: null,
    lodging: null,
    // The livestream the owner stored (F9; L12.1); null while the invitation has none.
    livestream: null,
    // The reminder switches (F6; L9.1): null while the owner switched nothing on.
    reminders: null,
  },
  // This deployment has no WhatsApp provider, so the capability the read answers is false (F6; S6, L9.5).
  remindersConfigured: false,
  availableFeatures: ["COUNTDOWN", "MAP", "CALENDAR"],
  // The precise-locations slice (S2): every stored point, keyed by the address field it belongs to.
  places: {},
};

/** The same draft after its feature settings were saved (F3; S4). */
const FEATURED = {
  ...OWNED,
  timeZone: "America/Tijuana",
  featureSettings: {
    whatsappPhone: "+525512345678",
    playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    playlistTitle: "Today’s Top Hits",
    playlistCoverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
    itinerary: null,
    giftRegistry: null,
    lodging: null,
    livestream: null,
    reminders: null,
  },
  remindersConfigured: false,
  availableFeatures: ["COUNTDOWN", "MAP", "WHATSAPP", "MUSIC", "GIFT_REGISTRY", "CALENDAR"],
};
/** A published invitation, as `POST /invitations/:id/publish` returns it (M5 T4). */
const PUBLISHED = { ...OWNED, status: "PUBLISHED", publishedAt: AT };

// The RSVP routes of the owner (M6 G1, G3; S1, S4): the settings pair, one response, the read with its totals,
// and the CSV download.
const RSVP_SETTINGS = { deadline: "2026-12-01T18:00:00.000Z", partyLimit: 4 };
const RSVP_RESPONSE = {
  id: "7b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e20",
  name: "Ana Pérez",
  attending: true,
  partySize: 2,
  companions: [{ name: "Luis", child: true }],
  dietaryNotes: "Sin nueces",
  phone: "+525512345678",
  message: "Con mucho gusto",
  createdAt: AT,
  updatedAt: AT,
};
const RSVP_READ = {
  settings: RSVP_SETTINGS,
  responses: [RSVP_RESPONSE],
  totals: {
    attendingPeople: 2,
    attendingAdults: 1,
    attendingChildren: 1,
    declinedCount: 0,
    responses: 1,
  },
};
const RSVP_CSV = 'Nombre,Asiste,Personas\r\n"Ana Pérez",Sí,2\r\n';
const RSVP_CSV_HEADERS = {
  "content-type": "text/csv; charset=utf-8",
  "content-disposition": 'attachment; filename="asistencia-invitacion-k7m2qx.csv"',
  "cache-control": "no-store",
};

/** Answers one request with a body that is not JSON, keeping the headers the API set. */
function answerFile(status: number, headers: Record<string, string>, body: string) {
  respond = (_request, response) => {
    response.writeHead(status, headers);
    response.end(body);
  };
}

const TEMPLATE = {
  id: ID,
  key: "cumpleanos",
  name: "Cumpleaños",
  description: null,
  category: { key: "cumpleanos", name: "Cumpleaños" },
  publishedVersion: {
    id: VERSION_ID,
    version: 2,
    componentKey: "birthday-poster-01",
    schema: { type: "object", properties: {} },
    configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
  },
};

const PACKAGE = {
  id: PACKAGE_ID,
  key: "basic",
  name: "Basic",
  description: null,
  currentPrice: { amountMinor: 150000, currency: "MXN" },
  includedFeatureKeys: ["COUNTDOWN"],
};

// The payment routes of the owner (M7 S4): the checkout, the state the panel renders, and the development emit.
const PAYMENT_ID = "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12";
const CHECKOUT = {
  paymentId: PAYMENT_ID,
  redirectUrl: `http://localhost:3000/cuenta/invitaciones/${ID}/pago/simulado/${PAYMENT_ID}`,
  amountMinor: 150000,
  currency: "MXN",
};
const INVITATION_PAYMENT = {
  paymentRequired: true,
  status: "pending",
  amountMinor: 150000,
  currency: "MXN",
  paidAt: null,
};
const PAYMENT_EMIT = { outcome: "processed" };

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
  answer(200, SUMMARY);
});

function client(cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`) {
  return createInvitationsClient(
    {
      config: {
        apiOrigin,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    },
    async () => cookie,
  );
}

describe("the feature write of the editor (F2; L4.3)", () => {
  it("sends the stored gift registry with the whole feature data the PUT replaces", async () => {
    const giftRegistry = {
      version: 1 as const,
      stores: [] as const,
      envelopes: true as const,
    };
    answer(200, FEATURED);
    const written = await client().updateInvitationFeatures(ID, {
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      itinerary: null,
      giftRegistry: { ...giftRegistry, stores: [] },
    });

    assert.equal(written.ok, true);
    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), {
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      itinerary: null,
      giftRegistry,
    });
  });

  it("keeps the stored registry when an older client sends the payload without it (F2; L4.3)", async () => {
    // The API keeps an omitted registry; this client always states it, and a body that omits it is no longer built
    // here. The test pins that the write carries exactly what the editor merged, which is the stored one plus the
    // fields it changed.
    answer(200, FEATURED);
    const written = await client().updateInvitationFeatures(ID, {
      timeZone: "America/Tijuana",
      whatsappPhone: null,
      playlistUrl: null,
      itinerary: null,
      giftRegistry: null,
      lodging: null,
    });

    assert.equal(written.ok, true);
    assert.equal(JSON.parse(received[0]?.body ?? "").giftRegistry, null);
  });
});

describe("requests", () => {
  it("sends each endpoint's method, path, and JSON body with only the session cookie and the secret", async () => {
    const api = client();
    const calls: Array<[() => Promise<unknown>, string, string, unknown, unknown]> = [
      [() => api.list(), "GET", "/invitations", undefined, [LIST_ITEM]],
      [() => api.get(ID), "GET", `/invitations/${ID}`, undefined, OWNED],
      [
        () => api.create({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
        "POST",
        "/invitations",
        { templateVersionId: VERSION_ID, packageId: PACKAGE_ID },
        OWNED,
      ],
      [
        () => api.replaceContent(ID, { celebrantName: "Ana" }),
        "PUT",
        `/invitations/${ID}/content`,
        { content: { celebrantName: "Ana" } },
        OWNED,
      ],
      [
        () => api.replaceContent(ID, { celebrantName: "Ana" }, AT),
        "PUT",
        `/invitations/${ID}/content`,
        { content: { celebrantName: "Ana" }, expectedUpdatedAt: AT },
        OWNED,
      ],
      [
        () =>
          api.updateInvitationFeatures(ID, {
            timeZone: "America/Tijuana",
            whatsappPhone: "+525512345678",
            playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
            itinerary: null,
            giftRegistry: null,
            lodging: null,
          }),
        "PUT",
        `/invitations/${ID}/features`,
        {
          timeZone: "America/Tijuana",
          whatsappPhone: "+525512345678",
          playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
          itinerary: null,
          giftRegistry: null,
          lodging: null,
        },
        FEATURED,
      ],
      [() => api.archive(ID), "POST", `/invitations/${ID}/archive`, undefined, SUMMARY],
      [() => api.publish(ID), "POST", `/invitations/${ID}/publish`, undefined, PUBLISHED],
      [() => api.unpublish(ID), "POST", `/invitations/${ID}/unpublish`, undefined, SUMMARY],
      [() => api.templates(), "GET", "/catalog/templates", undefined, [TEMPLATE]],
      [() => api.packages(), "GET", "/catalog/packages", undefined, [PACKAGE]],
      [() => api.checkout(ID), "POST", `/invitations/${ID}/checkout`, undefined, CHECKOUT],
      [() => api.payment(ID), "GET", `/invitations/${ID}/payment`, undefined, INVITATION_PAYMENT],
      [
        () => api.emitSimulatedPayment(PAYMENT_ID, "paid"),
        "POST",
        `/payments/simulated/${PAYMENT_ID}/emit`,
        { outcome: "paid" },
        PAYMENT_EMIT,
      ],
    ];

    for (const [call, method, path, body, expected] of calls) {
      received = [];
      answer(200, expected);
      const result = await call();

      assert.deepEqual(result, { ok: true, value: expected }, `${method} ${path}`);
      const request = received[0];
      assert.equal(received.length, 1, `${method} ${path}`);
      assert.equal(request?.method, method);
      assert.equal(request?.url, path);
      assert.equal(request?.headers.cookie, SESSION_COOKIE);
      assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
      assert.equal(
        request?.headers["content-type"],
        body === undefined ? undefined : "application/json",
      );
      assert.equal(request?.body, body === undefined ? "" : JSON.stringify(body));
    }
  });

  it("keeps the API's order of the list", async () => {
    answer(200, [
      { ...LIST_ITEM, id: VERSION_ID },
      { ...LIST_ITEM, id: PACKAGE_ID },
    ]);

    const result = await client().list();

    assert.deepEqual(result.ok && result.value.map((item) => item.id), [VERSION_ID, PACKAGE_ID]);
  });

  it("makes no request without a session cookie, and makes none for an id that is not a UUID", async () => {
    assert.deepEqual(await client(null).list(), { ok: false, failure: "signed-out" });
    assert.deepEqual(await client("theme=dark").get(ID), { ok: false, failure: "signed-out" });

    const api = client();
    for (const id of ["", "1", "not-a-uuid", `${ID}/../x`]) {
      assert.deepEqual(await api.get(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.replaceContent(id, {}), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(
        await api.updateInvitationFeatures(id, {
          timeZone: "America/Tijuana",
          whatsappPhone: null,
          playlistUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
        }),
        { ok: false, failure: "not-found" },
        id,
      );
      assert.deepEqual(await api.archive(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.publish(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.unpublish(id), { ok: false, failure: "not-found" }, id);
    }
    assert.deepEqual(received, []);
  });
});

describe("RSVP routes of the owner (M6 G1, G3; S1, S4)", () => {
  it("reads the settings, every response newest first, and the totals", async () => {
    answer(200, RSVP_READ);

    assert.deepEqual(await client().readRsvp(ID), { ok: true, value: RSVP_READ });
    const request = received[0];
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, `/invitations/${ID}/rsvp`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.body, "");
  });

  it("reads a body written before the companions existed, so a rolling deploy keeps both generations working (F3; L6.1)", async () => {
    // The API of the previous release answers no companions, no dietary notes, and no adults or children.
    answer(200, {
      settings: RSVP_SETTINGS,
      responses: [
        {
          id: RSVP_RESPONSE.id,
          name: "Ana Pérez",
          attending: true,
          partySize: 2,
          phone: null,
          message: null,
          createdAt: AT,
          updatedAt: AT,
        },
      ],
      totals: { attendingPeople: 2, declinedCount: 0, responses: 1 },
    });

    assert.deepEqual(await client().readRsvp(ID), {
      ok: true,
      value: {
        settings: RSVP_SETTINGS,
        responses: [
          {
            id: RSVP_RESPONSE.id,
            name: "Ana Pérez",
            attending: true,
            partySize: 2,
            companions: null,
            dietaryNotes: null,
            phone: null,
            message: null,
            createdAt: AT,
            updatedAt: AT,
          },
        ],
        // An answer that named nobody counts its whole party as adults, so the totals still add up.
        totals: {
          attendingPeople: 2,
          attendingAdults: 2,
          attendingChildren: 0,
          declinedCount: 0,
          responses: 1,
        },
      },
    });
  });

  it("saves the deadline and the party limit as the whole pair, and keeps a null deadline", async () => {
    answer(200, RSVP_SETTINGS);

    assert.deepEqual(await client().updateRsvpSettings(ID, RSVP_SETTINGS), {
      ok: true,
      value: RSVP_SETTINGS,
    });
    assert.equal(received[0]?.method, "PUT");
    assert.equal(received[0]?.url, `/invitations/${ID}/rsvp-settings`);
    assert.deepEqual(JSON.parse(received[0]?.body ?? "null"), RSVP_SETTINGS);

    received = [];
    answer(200, { deadline: null, partyLimit: 4 });
    assert.deepEqual(await client().updateRsvpSettings(ID, { deadline: null, partyLimit: 4 }), {
      ok: true,
      value: { deadline: null, partyLimit: 4 },
    });
    assert.deepEqual(JSON.parse(received[0]?.body ?? "null"), { deadline: null, partyLimit: 4 });
  });

  it("maps a refused settings save to its code and issues, and an archived invitation to not-editable", async () => {
    answer(400, {
      code: "INVALID_RSVP_SETTINGS",
      issues: ["partyLimit must be between 1 and 10"],
    });
    assert.deepEqual(await client().updateRsvpSettings(ID, { deadline: null, partyLimit: 40 }), {
      ok: false,
      failure: "rsvp-settings-invalid",
      issues: ["partyLimit must be between 1 and 10"],
    });

    answer(409, { code: "INVITATION_NOT_EDITABLE" });
    assert.deepEqual(await client().updateRsvpSettings(ID, RSVP_SETTINGS), {
      ok: false,
      failure: "not-editable",
    });
  });

  it("makes no request for an id that is not a UUID", async () => {
    const api = client();

    for (const id of ["", "1", "not-a-uuid"]) {
      assert.deepEqual(await api.readRsvp(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(
        await api.updateRsvpSettings(id, RSVP_SETTINGS),
        { ok: false, failure: "not-found" },
        id,
      );
      assert.deepEqual(await api.rsvpCsv(id), { ok: false, failure: "not-found" }, id);
    }
    assert.deepEqual(received, []);
  });

  it("downloads the CSV with the headers the API set", async () => {
    answerFile(200, RSVP_CSV_HEADERS, RSVP_CSV);

    assert.deepEqual(await client().rsvpCsv(ID), {
      ok: true,
      value: {
        body: RSVP_CSV,
        contentType: "text/csv; charset=utf-8",
        contentDisposition: 'attachment; filename="asistencia-invitacion-k7m2qx.csv"',
      },
    });
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/invitations/${ID}/rsvp.csv`);
    assert.equal(received[0]?.headers.cookie, SESSION_COOKIE);
  });

  it("maps a missing invitation of the CSV to not-found and fails closed on another body", async () => {
    answerFile(
      404,
      { "content-type": "application/json", "cache-control": "no-store" },
      '{"code":"INVITATION_NOT_FOUND"}',
    );
    assert.deepEqual(await client().rsvpCsv(ID), { ok: false, failure: "not-found" });

    answerFile(401, { "content-type": "application/json" }, '{"message":"Unauthorized"}');
    assert.deepEqual(await client().rsvpCsv(ID), { ok: false, failure: "signed-out" });

    for (const headers of [
      { ...RSVP_CSV_HEADERS, "content-type": "application/json" },
      { ...RSVP_CSV_HEADERS, "content-disposition": "inline" },
      { ...RSVP_CSV_HEADERS, "content-disposition": undefined },
      { ...RSVP_CSV_HEADERS, "content-disposition": 'attachment; filename="../../etc/passwd"' },
    ]) {
      answerFile(
        200,
        Object.fromEntries(
          Object.entries(headers).filter((entry): entry is [string, string] => Boolean(entry[1])),
        ),
        RSVP_CSV,
      );
      await assert.rejects(client().rsvpCsv(ID), (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, "invalid-response");
        return true;
      });
    }
  });
});

describe("payment routes of the owner (M7 S4)", () => {
  it("reads the payment state the panel and the return page render", async () => {
    answer(200, INVITATION_PAYMENT);
    assert.deepEqual(await client().payment(ID), { ok: true, value: INVITATION_PAYMENT });
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/invitations/${ID}/payment`);
    assert.equal(received[0]?.headers.cookie, SESSION_COOKIE);
    assert.equal(received[0]?.body, "");

    answer(200, { ...INVITATION_PAYMENT, paymentRequired: false, status: null });
    assert.deepEqual(await client().payment(ID), {
      ok: true,
      value: {
        paymentRequired: false,
        status: null,
        amountMinor: 150000,
        currency: "MXN",
        paidAt: null,
      },
    });
  });

  it("emits either outcome through the simulated route", async () => {
    for (const outcome of ["paid", "failed"] as const) {
      received = [];
      answer(200, { outcome: "duplicate" });

      assert.deepEqual(await client().emitSimulatedPayment(PAYMENT_ID, outcome), {
        ok: true,
        value: { outcome: "duplicate" },
      });
      assert.equal(received[0]?.method, "POST");
      assert.equal(received[0]?.url, `/payments/simulated/${PAYMENT_ID}/emit`);
      assert.deepEqual(JSON.parse(received[0]?.body ?? "null"), { outcome });
    }
  });

  it("maps every documented checkout refusal to its own failure", async () => {
    const cases: Array<[number, string, string]> = [
      [409, "PAYMENTS_DISABLED", "payments-disabled"],
      [409, "PAYMENT_NOT_REQUIRED", "payment-not-required"],
      [409, "PAYMENT_PRICE_UNAVAILABLE", "payment-price-unavailable"],
      [409, "PAYMENT_ALREADY_PAID", "payment-already-paid"],
      [409, "INVITATION_PACKAGE_LOCKED_BY_PAYMENT", "payment-package-locked"],
      [409, "INVITATION_NOT_EDITABLE", "not-editable"],
      [404, "INVITATION_NOT_FOUND", "not-found"],
      [503, "PAYMENT_PROVIDER_UNAVAILABLE", "payment-provider-unavailable"],
    ];

    for (const [status, code, failure] of cases) {
      answer(status, { code });
      assert.deepEqual(await client().checkout(ID), { ok: false, failure }, code);
    }
  });

  it("maps the simulated emit's own refusals", async () => {
    answer(409, { code: "PAYMENT_SIMULATED_DISABLED" });
    assert.deepEqual(await client().emitSimulatedPayment(PAYMENT_ID, "paid"), {
      ok: false,
      failure: "simulated-payment-disabled",
    });

    answer(404, { code: "PAYMENT_NOT_FOUND" });
    assert.deepEqual(await client().emitSimulatedPayment(PAYMENT_ID, "paid"), {
      ok: false,
      failure: "payment-not-found",
    });
  });

  it("makes no request for an invitation or a payment id that is not a UUID", async () => {
    const api = client();

    for (const id of ["", "1", "not-a-uuid", `${ID}/../x`]) {
      assert.deepEqual(await api.checkout(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.payment(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(
        await api.emitSimulatedPayment(id, "paid"),
        { ok: false, failure: "payment-not-found" },
        id,
      );
    }
    assert.deepEqual(received, []);
  });

  it("fails closed on a payment answer that breaks the contract", async () => {
    for (const body of [
      { ...CHECKOUT, paymentId: "1" },
      { ...CHECKOUT, redirectUrl: "" },
      { ...CHECKOUT, amountMinor: 1.5 },
      { ...CHECKOUT, currency: null },
    ]) {
      answer(200, body);
      await assert.rejects(client().checkout(ID), (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, "invalid-response");
        return true;
      });
    }

    for (const body of [
      { ...INVITATION_PAYMENT, paymentRequired: "sí" },
      { ...INVITATION_PAYMENT, status: "cancelled" },
      { ...INVITATION_PAYMENT, amountMinor: -1 },
      { ...INVITATION_PAYMENT, paidAt: "ayer" },
    ]) {
      answer(200, body);
      await assert.rejects(client().payment(ID), (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, "invalid-response");
        return true;
      });
    }
  });

  it("reads the payment shapes strictly", () => {
    assert.deepEqual(parseCheckout({ ...CHECKOUT, extra: true }), CHECKOUT);
    assert.deepEqual(parseInvitationPayment({ ...INVITATION_PAYMENT, ownerId: "leak" }), {
      ...INVITATION_PAYMENT,
      status: "pending",
    });
    assert.deepEqual(
      parseInvitationPayment({
        paymentRequired: false,
        status: null,
        amountMinor: null,
        currency: null,
        paidAt: null,
      }),
      { paymentRequired: false, status: null, amountMinor: null, currency: null, paidAt: null },
    );

    for (const value of [
      null,
      {},
      { ...CHECKOUT, redirectUrl: undefined },
      { ...CHECKOUT, redirectUrl: 7 },
      { ...CHECKOUT, amountMinor: Number.MAX_SAFE_INTEGER + 2 },
    ]) {
      assert.equal(parseCheckout(value), undefined, JSON.stringify(value));
    }

    for (const value of [
      null,
      {},
      { ...INVITATION_PAYMENT, paymentRequired: undefined },
      { ...INVITATION_PAYMENT, status: "PAID" },
      { ...INVITATION_PAYMENT, currency: "" },
      { ...INVITATION_PAYMENT, paidAt: undefined },
    ]) {
      assert.equal(parseInvitationPayment(value), undefined, JSON.stringify(value));
    }
  });
});

describe("errors", () => {
  it("reports an ended session as signed-out", async () => {
    answer(401, { message: "Unauthorized" });

    assert.deepEqual(await client().list(), { ok: false, failure: "signed-out" });
  });

  it("maps every documented code of a 404, and an unreadable one to not-found", async () => {
    const cases: Array<[string | undefined, string]> = [
      ["INVITATION_NOT_FOUND", "not-found"],
      ["INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED", "version-not-published"],
      ["INVITATION_PACKAGE_NOT_FOUND", "package-not-found"],
      [undefined, "not-found"],
      ["SOMETHING_ELSE", "not-found"],
    ];

    for (const [code, failure] of cases) {
      answer(404, code === undefined ? {} : { code });
      assert.deepEqual(
        await client().create({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
        { ok: false, failure },
        String(code),
      );
    }
  });

  it("maps the 400 codes of a refused draft, and an unknown 400 to a validation failure", async () => {
    const cases: Array<[string | undefined, string]> = [
      ["INVITATION_PACKAGE_DOES_NOT_FIT", "package-does-not-fit"],
      ["INVALID_INVITATION_CONTENT", "content-invalid"],
      [undefined, "validation"],
    ];

    for (const [code, failure] of cases) {
      answer(400, code === undefined ? {} : { code, issues: ["content.age must be an integer"] });
      assert.deepEqual(
        await client().replaceContent(ID, { age: 1.5 }),
        { ok: false, failure },
        String(code),
      );
    }
  });

  it("maps the 400 feature issues the API names, and never trusts an unreadable list", async () => {
    const issues = [
      "timeZone must be one of the supported time zones",
      "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
    ];

    answer(400, { code: "INVALID_INVITATION_FEATURES", issues });
    assert.deepEqual(
      await client().updateInvitationFeatures(ID, {
        timeZone: "Europe/Madrid",
        whatsappPhone: "12",
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
      }),
      { ok: false, failure: "features-invalid", issues },
    );

    answer(400, { code: "INVALID_INVITATION_FEATURES", issues: "timeZone" });
    assert.deepEqual(
      await client().updateInvitationFeatures(ID, {
        timeZone: "Europe/Madrid",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
      }),
      { ok: false, failure: "features-invalid" },
    );
  });

  it("maps the 409 codes of a refused write", async () => {
    for (const [code, failure] of [
      ["INVITATION_NOT_EDITABLE", "not-editable"],
      ["INVITATION_ALREADY_ARCHIVED", "already-archived"],
    ] as const) {
      answer(409, { code });
      assert.deepEqual(await client().archive(ID), { ok: false, failure }, code);
    }

    // A content write that named a version another writer already moved: nothing was stored.
    answer(409, { code: "INVITATION_CONTENT_CONFLICT" });
    const refused = await client().replaceContent(ID, {}, AT);
    assert.deepEqual(refused, { ok: false, failure: "content-conflict" });
  });

  it("maps the 409 codes of a publication, with the readiness issues of a refused publish", async () => {
    answer(409, { code: "INVITATION_ALREADY_PUBLISHED" });
    assert.deepEqual(await client().publish(ID), { ok: false, failure: "already-published" });

    answer(409, { code: "INVITATION_NOT_PUBLISHED" });
    assert.deepEqual(await client().unpublish(ID), { ok: false, failure: "not-published" });

    answer(409, {
      code: "INVITATION_NOT_PUBLISHABLE",
      issues: ["content.date is required to publish", "template version is no longer published"],
    });
    assert.deepEqual(await client().publish(ID), {
      ok: false,
      failure: "not-publishable",
      issues: ["content.date is required to publish", "template version is no longer published"],
    });

    // An issues list that is not an array of strings is not trusted either way.
    answer(409, { code: "INVITATION_NOT_PUBLISHABLE", issues: "content.date" });
    assert.deepEqual(await client().publish(ID), { ok: false, failure: "not-publishable" });
  });

  it("maps the 402 payment gate, and refuses a 402 without its code", async () => {
    answer(402, { code: "INVITATION_PAYMENT_REQUIRED", reason: "PAYMENT_REQUIRED" });
    assert.deepEqual(await client().publish(ID), { ok: false, failure: "payment-required" });

    answer(402, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().publish(ID), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 402);
      return true;
    });
  });

  it("fails closed on a 5xx, a redirect, and a success body that breaks the contract", async () => {
    answer(503, { code: "INVITATION_SLUG_UNAVAILABLE" });
    await assert.rejects(
      client().create({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
      {
        name: "ApiClientError",
        kind: "unavailable",
        status: 503,
      },
    );

    answer(302, "");
    await assert.rejects(client().list(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 302);
      return true;
    });

    answer(200, "not json");
    await assert.rejects(client().list(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });

    answer(200, [{ ...SUMMARY, status: "EXPIRED" }]);
    await assert.rejects(client().list(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

describe("validators", () => {
  it("accepts the documented shapes and keeps only the fields the pages use", () => {
    assert.deepEqual(parseInvitationSummaries([{ ...SUMMARY, extra: true }]), [SUMMARY]);
    assert.deepEqual(parseOwnedInvitation({ ...OWNED, ownerId: "leak" }), OWNED);
    assert.deepEqual(parseCreatorTemplates([TEMPLATE]), [TEMPLATE]);
    assert.deepEqual(parseCreatorPackages([{ ...PACKAGE, status: "ACTIVE" }]), [PACKAGE]);
  });

  it("reads the reminder switches and the capability, and tolerates a body written before them (F6; L9.1, L9.5, L20)", () => {
    const stored = {
      ...OWNED,
      featureSettings: {
        ...OWNED.featureSettings,
        reminders: { version: 1, pendingRsvp: true, eventEve: false },
      },
      remindersConfigured: false,
    };

    assert.deepEqual(parseOwnedInvitation(stored)?.featureSettings.reminders, {
      version: 1,
      pendingRsvp: true,
      eventEve: false,
    });
    assert.equal(parseOwnedInvitation(stored)?.remindersConfigured, false);

    // A body written before F6 carries neither the switches nor the capability: both read as "nothing on" (L20).
    const older = {
      ...OWNED,
      featureSettings: {
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
      },
    };
    const read = parseOwnedInvitation(older);

    assert.equal(read?.featureSettings.reminders, null);
    assert.equal(read?.remindersConfigured, false);

    // A pair with nothing switched on reads as no settings, and a shape nobody wrote refuses the whole body.
    assert.equal(
      parseOwnedInvitation({
        ...OWNED,
        featureSettings: {
          ...OWNED.featureSettings,
          reminders: { version: 1, pendingRsvp: false, eventEve: false },
        },
      })?.featureSettings.reminders,
      null,
    );
    for (const reminders of [
      { version: 2, pendingRsvp: true, eventEve: true },
      { version: 1, pendingRsvp: "sí", eventEve: true },
      [],
      "on",
    ]) {
      assert.equal(
        parseOwnedInvitation({
          ...OWNED,
          featureSettings: { ...OWNED.featureSettings, reminders },
        }),
        undefined,
        JSON.stringify(reminders),
      );
    }
    for (const remindersConfigured of ["false", 0, null]) {
      assert.equal(
        parseOwnedInvitation({ ...OWNED, remindersConfigured }),
        undefined,
        JSON.stringify(remindersConfigured),
      );
    }
  });

  it("refuses a summary with a status, slug, timestamp, or id that breaks the contract", () => {
    const broken = [
      { ...SUMMARY, id: "1" },
      { ...SUMMARY, templateVersionId: null },
      { ...SUMMARY, packageId: 7 },
      { ...SUMMARY, slug: "" },
      { ...SUMMARY, slug: "Inv itacion" },
      { ...SUMMARY, status: "EXPIRED" },
      { ...SUMMARY, publishedAt: "yesterday" },
      { ...SUMMARY, publishedAt: undefined },
      { ...SUMMARY, archivedAt: "yesterday" },
      { ...SUMMARY, createdAt: 0 },
      { ...SUMMARY, updatedAt: null },
    ];

    for (const summary of broken) {
      assert.equal(parseInvitationSummaries([summary]), undefined, JSON.stringify(summary));
    }
    assert.equal(parseInvitationSummaries("[]"), undefined);
    assert.equal(parseInvitationSummaries([SUMMARY, null]), undefined);
  });

  it("reads the content and the pinned version's renderer of a list row (T2; S2.6)", () => {
    assert.deepEqual(parseInvitationListItems([LIST_ITEM]), [LIST_ITEM]);
    // A field this deployment does not render is dropped instead of reaching a page.
    assert.deepEqual(parseInvitationListItems([{ ...LIST_ITEM, ownerId: "leak" }]), [LIST_ITEM]);
    // A row written before the fields existed still lists, and its card falls back to the summary.
    assert.deepEqual(parseInvitationListItems([SUMMARY]), [
      { ...SUMMARY, content: {}, componentKey: null, configuration: null },
    ]);
    assert.deepEqual(parseInvitationListItems([]), []);
  });

  it("refuses a list row whose content or renderer breaks the contract (T2; S2.6)", () => {
    for (const item of [
      { ...LIST_ITEM, content: "Ana" },
      { ...LIST_ITEM, content: { nested: { a: 1 } } },
      { ...LIST_ITEM, content: null },
      { ...LIST_ITEM, componentKey: 42 },
      { ...LIST_ITEM, componentKey: "" },
      { ...SUMMARY, status: "EXPIRED" },
    ]) {
      assert.equal(parseInvitationListItems([item]), undefined, JSON.stringify(item));
    }
  });

  it("refuses content that is not a JSON object of primitive values", () => {
    for (const content of [
      null,
      [],
      "text",
      { nested: { a: 1 } },
      { list: [1] },
      { empty: null },
    ]) {
      assert.equal(parseOwnedInvitation({ ...OWNED, content }), undefined, JSON.stringify(content));
    }
    assert.equal(parseOwnedInvitation({ ...OWNED, missingRequiredFields: "date" }), undefined);
    assert.equal(parseOwnedInvitation({ ...OWNED, missingRequiredFields: [1] }), undefined);
  });

  it("accepts the omitted sections the pinned schema stores, and nothing else of that shape (S8.2)", () => {
    const content = { celebrantName: "Ana", omittedSections: ["ceremony", "reception"] };

    assert.deepEqual(parseOwnedInvitation({ ...OWNED, content })?.content, content);
    assert.deepEqual(parseInvitationListItems([{ ...LIST_ITEM, content }])?.[0]?.content, content);
    // An empty list is a stored answer too: the owner showed every section again.
    assert.deepEqual(
      parseOwnedInvitation({ ...OWNED, content: { omittedSections: [] } })?.content,
      {
        omittedSections: [],
      },
    );

    for (const omittedSections of [
      "ceremony",
      ["ceremony", "ceremony"],
      ["Ceremony"],
      ["ceremony-1"],
      [""],
      [1],
      [null],
      { key: "ceremony" },
      Array.from({ length: 25 }, (_, index) => `key${index}`),
    ]) {
      assert.equal(
        parseOwnedInvitation({ ...OWNED, content: { omittedSections } }),
        undefined,
        JSON.stringify(omittedSections),
      );
    }

    // Every other property still has to be a primitive: the list is the one exception, and only under its own name.
    for (const extra of [{ tags: ["uno"] }, { sections: { ceremony: true } }, { empty: null }]) {
      assert.equal(
        parseOwnedInvitation({ ...OWNED, content: { celebrantName: "Ana", ...extra } }),
        undefined,
        JSON.stringify(extra),
      );
    }
  });

  it("keeps the stored feature data, and refuses a zone or a feature key it does not know (S4)", () => {
    const broken = [
      { ...OWNED, timeZone: undefined },
      { ...OWNED, timeZone: "Europe/Madrid" },
      { ...OWNED, timeZone: "America/mexico_city" },
      { ...OWNED, timeZone: 7 },
      { ...OWNED, featureSettings: undefined },
      { ...OWNED, featureSettings: {} },
      { ...OWNED, featureSettings: { whatsappPhone: 7, playlistUrl: null } },
      // The API stores E.164, so a national number is not a stored phone this client reads.
      { ...OWNED, featureSettings: { whatsappPhone: "5512345678", playlistUrl: null } },
      // The stored link is an https URL of bounded length or null (S7).
      { ...OWNED, featureSettings: { whatsappPhone: null, playlistUrl: 7 } },
      {
        ...OWNED,
        featureSettings: { whatsappPhone: null, playlistUrl: "http://open.spotify.com/x" },
      },
      {
        ...OWNED,
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: `https://open.spotify.com/${"a".repeat(500)}`,
        },
      },
      { ...OWNED, availableFeatures: undefined },
      { ...OWNED, availableFeatures: "CALENDAR" },
      { ...OWNED, availableFeatures: ["CALENDAR", "PLAYLIST"] },
      { ...OWNED, availableFeatures: [7] },
    ];

    for (const value of broken) {
      assert.equal(parseOwnedInvitation(value), undefined, JSON.stringify(value));
    }
    assert.deepEqual(parseOwnedInvitation(FEATURED), FEATURED);
  });

  it("reads the stored itinerary payload and refuses one of another shape (F1; L3.1)", () => {
    const itinerary = {
      version: 1,
      items: [{ time: "17:00", title: "Misa", address: "Av. Juárez 45" }],
    };
    const parse = (featureSettings: unknown) =>
      parseOwnedInvitation({ ...OWNED, featureSettings })?.featureSettings.itinerary;

    assert.deepEqual(parse({ ...OWNED.featureSettings, itinerary }), itinerary);
    // A body written before the column existed reads as no itinerary, never as a missing value the editor guesses.
    assert.equal(parse({ whatsappPhone: null, playlistUrl: null }), null);
    assert.equal(parse({ ...OWNED.featureSettings, itinerary: null }), null);

    for (const broken of [
      { version: 2, items: itinerary.items },
      { version: 1, items: [] },
      { version: 1, items: "Misa" },
      { version: 1, items: [{ time: "24:00", title: "Misa" }] },
      { items: itinerary.items },
      "Misa",
    ]) {
      assert.equal(
        parse({ ...OWNED.featureSettings, itinerary: broken }),
        undefined,
        JSON.stringify(broken),
      );
    }
  });

  it("reads the stored gift registry payload and refuses one of another shape (F2; L4.1)", () => {
    const giftRegistry = {
      version: 1,
      stores: [{ name: "Liverpool", reference: "Evento 51234567", url: "https://x.mx/1" }],
      transfer: { bank: "BBVA", holder: "Ana Martínez", clabe: "012180000123456782" },
      envelopes: true,
      note: "Con cariño",
    };
    const parse = (featureSettings: unknown) =>
      parseOwnedInvitation({ ...OWNED, featureSettings })?.featureSettings.giftRegistry;

    assert.deepEqual(parse({ ...OWNED.featureSettings, giftRegistry }), giftRegistry);
    // A body written before the column existed reads as no registry, never as a missing value the editor guesses.
    assert.equal(parse({ whatsappPhone: null, playlistUrl: null }), null);
    assert.equal(parse({ ...OWNED.featureSettings, giftRegistry: null }), null);

    for (const broken of [
      { ...giftRegistry, version: 2 },
      { ...giftRegistry, stores: [{ name: "Liverpool", url: "http://x.mx/1" }] },
      { ...giftRegistry, stores: [{ name: "Liverpool", url: "https://x.mx/1" }], extra: true },
      { version: 1, stores: [] },
      "mesa",
    ]) {
      assert.equal(
        parse({ ...OWNED.featureSettings, giftRegistry: broken }),
        undefined,
        JSON.stringify(broken),
      );
    }
  });

  it("reads the stored playlist title and cover, and drops a value it does not accept (S2)", () => {
    const cover = "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07";
    const base = {
      whatsappPhone: null,
      playlistUrl: "https://open.spotify.com/playlist/abc",
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      livestream: null,
      reminders: null,
    };
    const parse = (featureSettings: unknown) =>
      parseOwnedInvitation({ ...OWNED, featureSettings })?.featureSettings;

    // The metadata the API stored travels with the link, so the editor and the preview can render it.
    assert.deepEqual(parse({ ...base, playlistTitle: "La boda", playlistCoverUrl: cover }), {
      ...base,
      playlistTitle: "La boda",
      playlistCoverUrl: cover,
    });
    // A body written before the metadata existed, and one whose lookup stored nothing, both read as "none".
    assert.deepEqual(parse(base), { ...base, playlistTitle: null, playlistCoverUrl: null });
    assert.deepEqual(parse({ ...base, playlistTitle: null, playlistCoverUrl: null }), {
      ...base,
      playlistTitle: null,
      playlistCoverUrl: null,
    });

    // A title of 201 characters and a cover off the allow-list never reach the card, and never refuse the
    // invitation either: the link itself is still the owner's playlist.
    assert.deepEqual(parse({ ...base, playlistTitle: "a".repeat(201), playlistCoverUrl: cover }), {
      ...base,
      playlistTitle: null,
      playlistCoverUrl: cover,
    });
    for (const playlistCoverUrl of [
      "http://i.scdn.co/image/abc",
      "https://evil.test/cover.jpg",
      "https://i.scdn.co.evil.test/cover.jpg",
      7,
    ]) {
      assert.deepEqual(
        parse({ ...base, playlistTitle: "La boda", playlistCoverUrl }),
        { ...base, playlistTitle: "La boda", playlistCoverUrl: null },
        JSON.stringify(playlistCoverUrl),
      );
    }
  });

  it("accepts the guest list and the QR pass in an owned invitation's features (M6 G2; S4)", () => {
    // A Deluxe package gates both keys, so a parser that lacked either would refuse the whole body and the
    // owner's page would stop loading.
    const deluxe = {
      ...OWNED,
      availableFeatures: [
        "COUNTDOWN",
        "MAP",
        "RSVP",
        "WHATSAPP",
        "GUEST_LIST",
        "QR_PASS",
        "CALENDAR",
      ],
    };

    assert.deepEqual(parseOwnedInvitation(deluxe), deluxe);
  });

  it("refuses a template or a package that breaks the creator catalog contract", () => {
    assert.equal(parseCreatorTemplates([{ ...TEMPLATE, publishedVersion: null }]), undefined);
    assert.equal(parseCreatorTemplates([{ ...TEMPLATE, category: { key: "k" } }]), undefined);
    assert.equal(
      parseCreatorTemplates([
        { ...TEMPLATE, publishedVersion: { ...TEMPLATE.publishedVersion, version: 0 } },
      ]),
      undefined,
    );
    assert.equal(
      parseCreatorPackages([{ ...PACKAGE, currentPrice: { amountMinor: 1.5 } }]),
      undefined,
    );
    assert.equal(parseCreatorPackages([{ ...PACKAGE, includedFeatureKeys: [1] }]), undefined);
    assert.deepEqual(parseCreatorPackages([{ ...PACKAGE, currentPrice: null }]), [
      { ...PACKAGE, currentPrice: null },
    ]);
  });

  it("keeps the published version's configuration, which the chooser previews (S9)", () => {
    // The configuration is read as stored: the web reads a theme from it and never from a catalog name, and
    // an unreadable snapshot is the renderer's refusal, not a reason to drop the template here.
    const [parsed] =
      parseCreatorTemplates([
        {
          ...TEMPLATE,
          publishedVersion: {
            ...TEMPLATE.publishedVersion,
            configuration: { componentKey: "birthday-map-01", theme: "dinosaurs" },
          },
        },
      ]) ?? [];

    assert.deepEqual(parsed?.publishedVersion.configuration, {
      componentKey: "birthday-map-01",
      theme: "dinosaurs",
    });
  });

  it("reads the RSVP settings and the owner's read strictly (M6 G3; S4)", () => {
    assert.deepEqual(parseRsvpSettings(RSVP_SETTINGS), RSVP_SETTINGS);
    assert.deepEqual(parseRsvpSettings({ deadline: null, partyLimit: 10 }), {
      deadline: null,
      partyLimit: 10,
    });
    assert.deepEqual(parseRsvpRead(RSVP_READ), RSVP_READ);

    for (const value of [
      null,
      {},
      { deadline: null },
      { deadline: null, partyLimit: 0 },
      { deadline: null, partyLimit: 11 },
      { deadline: null, partyLimit: 2.5 },
      { deadline: "mañana", partyLimit: 4 },
      { deadline: 7, partyLimit: 4 },
    ]) {
      assert.equal(parseRsvpSettings(value), undefined, JSON.stringify(value));
    }

    for (const value of [
      null,
      {},
      { settings: RSVP_SETTINGS, responses: [], totals: {} },
      { settings: RSVP_SETTINGS, responses: {}, totals: RSVP_READ.totals },
      {
        settings: RSVP_SETTINGS,
        responses: [{ ...RSVP_RESPONSE, id: "1" }],
        totals: RSVP_READ.totals,
      },
      {
        settings: RSVP_SETTINGS,
        responses: [{ ...RSVP_RESPONSE, name: "" }],
        totals: RSVP_READ.totals,
      },
      {
        settings: RSVP_SETTINGS,
        responses: [{ ...RSVP_RESPONSE, partySize: 11 }],
        totals: RSVP_READ.totals,
      },
      {
        settings: RSVP_SETTINGS,
        responses: [{ ...RSVP_RESPONSE, attending: "sí" }],
        totals: RSVP_READ.totals,
      },
      {
        settings: RSVP_SETTINGS,
        responses: [RSVP_RESPONSE],
        totals: { attendingPeople: -1, declinedCount: 0, responses: 1 },
      },
      {
        settings: RSVP_SETTINGS,
        responses: [RSVP_RESPONSE],
        totals: { attendingPeople: 2, declinedCount: 0 },
      },
    ]) {
      assert.equal(parseRsvpRead(value), undefined, JSON.stringify(value));
    }
  });

  it("recognises the canonical UUID shape the API accepts as an id", () => {
    assert.equal(isInvitationId(ID), true);
    assert.equal(isInvitationId(ID.toUpperCase()), true);
    for (const value of ["", "123", `${ID} `, null, 7]) {
      assert.equal(isInvitationId(value), false, String(value));
    }
  });
});

// The precise locations of one invitation (S1, S2): the search an owner types into, the point each address field
// stores, and the read that carries every stored point. The editor reads all three through this client, so each
// documented status keeps its own failure and nothing typed reaches a log.

const PARROQUIA = {
  label: "Parroquia de San José, Querétaro",
  lat: 20.588793,
  lng: -100.389888,
};
const JARDIN = { label: "Jardín de los Olivos, Querétaro", lat: 20.6, lng: -100.4 };
const WITH_PLACE = { ...OWNED, places: { address: PARROQUIA } };

describe("place routes of the owner (S1, S2)", () => {
  it("searches with the trimmed text as one encoded query parameter", async () => {
    answer(200, [PARROQUIA, JARDIN]);

    assert.deepEqual(await client().searchPlaces(ID, "  Parroquia de San José  "), {
      ok: true,
      value: [PARROQUIA, JARDIN],
    });
    const request = received[0];
    assert.equal(request?.method, "GET");
    assert.equal(
      request?.url,
      `/invitations/${ID}/places/search?q=${encodeURIComponent("Parroquia de San José")}`,
    );
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.body, "");
  });

  it("sends no request for a text the API would refuse", async () => {
    const api = client();

    assert.deepEqual(await api.searchPlaces(ID, "Sa"), {
      ok: false,
      failure: "place-query-invalid",
    });
    assert.deepEqual(await api.searchPlaces(ID, "   "), {
      ok: false,
      failure: "place-query-invalid",
    });
    assert.deepEqual(await api.searchPlaces(ID, "x".repeat(121)), {
      ok: false,
      failure: "place-query-invalid",
    });
    assert.deepEqual(received, []);
  });

  it("keeps the API's own refusal of a query and of the search limit apart", async () => {
    answer(400, { code: "INVALID_PLACE_QUERY", issues: ["q must be 3 to 120 characters"] });
    assert.deepEqual(await client().searchPlaces(ID, "San"), {
      ok: false,
      failure: "place-query-invalid",
    });

    answer(429, { code: "PLACE_SEARCH_RATE_LIMITED" });
    assert.deepEqual(await client().searchPlaces(ID, "San"), {
      ok: false,
      failure: "place-search-rate-limited",
    });
  });

  it("answers not-found for a foreign, unknown, or malformed id without asking the geocoder", async () => {
    answer(404, { code: "INVITATION_NOT_FOUND" });

    assert.deepEqual(await client().searchPlaces(ID, "San"), { ok: false, failure: "not-found" });
    assert.equal(received.length, 1);
    assert.deepEqual(await client().searchPlaces("not-a-uuid", "San"), {
      ok: false,
      failure: "not-found",
    });
    assert.equal(received.length, 1);
  });

  it("stores the point the owner chose and answers the invitation with its points", async () => {
    answer(200, WITH_PLACE);

    assert.deepEqual(await client().savePlace(ID, "address", PARROQUIA), {
      ok: true,
      value: WITH_PLACE,
    });
    const request = received[0];
    assert.equal(request?.method, "PUT");
    assert.equal(request?.url, `/invitations/${ID}/places/address`);
    assert.deepEqual(JSON.parse(request?.body ?? ""), PARROQUIA);
  });

  it("clears the point of one field with a DELETE of the same path", async () => {
    answer(200, OWNED);

    assert.deepEqual(await client().clearPlace(ID, "ceremonyAddress"), {
      ok: true,
      value: OWNED,
    });
    assert.equal(received[0]?.method, "DELETE");
    assert.equal(received[0]?.url, `/invitations/${ID}/places/ceremonyAddress`);
    assert.equal(received[0]?.body, "");
  });

  it("refuses a field that names no address field before anything is sent", async () => {
    const api = client();

    assert.deepEqual(await api.savePlace(ID, "celebrantName", PARROQUIA), {
      ok: false,
      failure: "not-found",
    });
    assert.deepEqual(await api.clearPlace(ID, "constructor"), {
      ok: false,
      failure: "not-found",
    });
    assert.deepEqual(received, []);
  });

  it("keeps the API's refusals of a point and of an archived invitation", async () => {
    answer(400, {
      code: "INVALID_INVITATION_PLACE",
      issues: ["lat must be a number between -90 and 90"],
    });
    assert.deepEqual(await client().savePlace(ID, "address", PARROQUIA), {
      ok: false,
      failure: "place-invalid",
    });

    answer(409, { code: "INVITATION_NOT_EDITABLE" });
    assert.deepEqual(await client().savePlace(ID, "address", PARROQUIA), {
      ok: false,
      failure: "not-editable",
    });
    assert.deepEqual(await client().clearPlace(ID, "address"), {
      ok: false,
      failure: "not-editable",
    });
  });

  it("refuses an answer whose points are not the documented shape", async () => {
    for (const places of [
      undefined,
      null,
      [],
      { celebrantName: PARROQUIA },
      { address: { label: "Sin coordenadas" } },
      { address: { label: "", lat: 1, lng: 1 } },
      { address: { label: "Lejos", lat: 91, lng: 0 } },
    ]) {
      answer(200, { ...OWNED, places });
      await assert.rejects(client().get(ID), (error: unknown) => {
        assert.equal((error as ApiClientError).kind, "invalid-response");
        return true;
      });
    }
  });
});

describe("parsePlaceSuggestions (S1, S2)", () => {
  it("reads at most five points and refuses anything else", () => {
    assert.deepEqual(parsePlaceSuggestions([PARROQUIA]), [PARROQUIA]);
    assert.equal(
      parsePlaceSuggestions([PARROQUIA, PARROQUIA, PARROQUIA, PARROQUIA, PARROQUIA])?.length,
      5,
    );
    assert.equal(
      parsePlaceSuggestions([PARROQUIA, PARROQUIA, PARROQUIA, PARROQUIA, PARROQUIA, PARROQUIA]),
      undefined,
    );
    assert.equal(parsePlaceSuggestions([{ label: "Sin punto" }]), undefined);
    assert.equal(parsePlaceSuggestions({ places: [PARROQUIA] }), undefined);
  });
});

// The album routes of the owner (F8; L11.6): the read is every photo with its state and one count per state, the write
// answers the photo it changed, and both are owner-only — a foreign or unknown invitation is the same 404 (A4), and so
// is a photo that is not this invitation's.
/** The origin this deployment's API builds its `/media/<id>` URLs from, which the owner read is checked against (A5). */
const MEDIA_ORIGIN = "http://localhost:3001";
const PHOTO_ID = "6b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e16";
const PHOTO = {
  id: PHOTO_ID,
  url: `${MEDIA_ORIGIN}/media/${PHOTO_ID}`,
  uploaderName: "Tía Rosa",
  status: "PENDING",
  createdAt: AT,
  reviewedAt: null,
};
const ALBUM_READ = {
  photos: [PHOTO],
  pendingCount: 1,
  publishedCount: 0,
  hiddenCount: 0,
};

/** One photo as the client's own origin serves it: the local test server stands in for the API (A5). */
const photoAt = (origin: string) => ({ ...PHOTO, url: `${origin}/media/${PHOTO_ID}` });
const albumAt = (origin: string) => ({ ...ALBUM_READ, photos: [photoAt(origin)] });

const parseAlbum = (value: unknown): unknown => parseGuestAlbumRead(value, MEDIA_ORIGIN);
const parsePhoto = (value: unknown): unknown => parseGuestPhoto(value, MEDIA_ORIGIN);

describe("the owner's album read (F8; L11.6)", () => {
  it("reads every photo with its state and the three counts", async () => {
    answer(200, albumAt(apiOrigin));

    const read = await client().album(ID);

    assert.deepEqual(read, { ok: true, value: albumAt(apiOrigin) });
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/invitations/${ID}/guest-photos`);
    assert.equal(received[0]?.headers.cookie, SESSION_COOKIE);
    assert.deepEqual(parsePhoto(PHOTO), PHOTO);
  });

  it("refuses a body whose counts disagree with the photos, or a photo that is not this contract", () => {
    for (const value of [
      { ...ALBUM_READ, pendingCount: 2 },
      { ...ALBUM_READ, publishedCount: 1 },
      { ...ALBUM_READ, hiddenCount: -1 },
      { ...ALBUM_READ, pendingCount: 1.5 },
      {
        photos: [{ ...PHOTO, status: "APPROVED" }],
        pendingCount: 0,
        publishedCount: 0,
        hiddenCount: 0,
      },
      {
        photos: [{ ...PHOTO, url: "https://evil.example/media/x" }],
        pendingCount: 1,
        publishedCount: 0,
        hiddenCount: 0,
      },
      {
        photos: [{ ...PHOTO, uploaderName: "x".repeat(61) }],
        pendingCount: 1,
        publishedCount: 0,
        hiddenCount: 0,
      },
      { photos: {}, pendingCount: 0, publishedCount: 0, hiddenCount: 0 },
      null,
    ]) {
      assert.equal(parseAlbum(value), undefined, JSON.stringify(value).slice(0, 80));
    }
  });

  it("keeps the album of a package that stopped granting the key, so the owner's screen never disappears", async () => {
    // Moderation is never gated by the catalog: the API still answers what the invitation already received.
    answer(200, { photos: [], pendingCount: 0, publishedCount: 0, hiddenCount: 0 });

    assert.deepEqual(await client().album(ID), {
      ok: true,
      value: { photos: [], pendingCount: 0, publishedCount: 0, hiddenCount: 0 },
    });
  });

  it("answers not-found for another owner's invitation and sends no request for an id that is not one", async () => {
    answer(404, { code: "INVITATION_NOT_FOUND" });

    assert.deepEqual(await client().album(ID), { ok: false, failure: "not-found" });
    assert.deepEqual(await client().album("not-an-id"), { ok: false, failure: "not-found" });
    assert.equal(received.length, 1);
  });
});

describe("the owner's moderation writes (F8; L11.6)", () => {
  it("publishes a photo with PATCH and answers the stored photo", async () => {
    answer(200, { ...photoAt(apiOrigin), status: "PUBLISHED", reviewedAt: AT });

    const written = await client().reviewGuestPhoto(ID, PHOTO_ID, "PUBLISHED");

    assert.deepEqual(written, {
      ok: true,
      value: { ...photoAt(apiOrigin), status: "PUBLISHED", reviewedAt: AT },
    });
    assert.equal(received[0]?.method, "PATCH");
    assert.equal(received[0]?.url, `/invitations/${ID}/guest-photos/${PHOTO_ID}`);
    assert.deepEqual(JSON.parse(received[0]?.body ?? "null"), { status: "PUBLISHED" });
  });

  it("hides a photo with the same route and answers not-found for one that is not this invitation's", async () => {
    answer(404, { code: "GUEST_PHOTO_NOT_FOUND" });

    assert.deepEqual(await client().reviewGuestPhoto(ID, PHOTO_ID, "HIDDEN"), {
      ok: false,
      failure: "guest-photo-not-found",
    });
    assert.deepEqual(JSON.parse(received[0]?.body ?? "null"), { status: "HIDDEN" });
    // A photo id that cannot be one names nothing, so no request is made.
    assert.deepEqual(await client().reviewGuestPhoto(ID, "not-an-id", "HIDDEN"), {
      ok: false,
      failure: "guest-photo-not-found",
    });
    assert.equal(received.length, 1);
  });

  it("maps a state the API refuses to the page's own validation error, and fails closed on anything else", async () => {
    answer(400, {
      code: "INVALID_GUEST_PHOTO_REVIEW",
      issues: ["status must be PUBLISHED or HIDDEN"],
    });
    assert.deepEqual(await client().reviewGuestPhoto(ID, PHOTO_ID, "PUBLISHED"), {
      ok: false,
      failure: "validation",
    });

    answer(409, { code: "SOMETHING_UNKNOWN" });
    await assert.rejects(client().reviewGuestPhoto(ID, PHOTO_ID, "PUBLISHED"), (error: unknown) => {
      assert.equal((error as ApiClientError).kind, "rejected");
      return true;
    });
  });
});

// The gated keys the owner read answers (F8; L11.2): a key the API gates but the web mirror lacks would refuse the whole
// body, so a Deluxe invitation — whose package grants `GUEST_ALBUM` — must keep its read parseable.
describe("the guest album key of the owner read (F8; L11.2)", () => {
  it("reads a Deluxe invitation that answers GUEST_ALBUM among its available features", async () => {
    answer(200, { ...OWNED, availableFeatures: [...OWNED.availableFeatures, "GUEST_ALBUM"] });

    const read = await client().get(ID);

    assert.equal(read.ok, true);
    assert.deepEqual(read.ok && read.value.availableFeatures, [
      "COUNTDOWN",
      "MAP",
      "CALENDAR",
      "GUEST_ALBUM",
    ]);
  });
});
