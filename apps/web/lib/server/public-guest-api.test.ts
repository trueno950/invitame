import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createPublicInvitationsClient,
  type PublicGuestInvitation,
  type PublicGuestRsvpSubmission,
  parsePublicGuestInvitation as parsePublicGuestInvitationContract,
} from "./public-invitations-api.ts";

// One guest's personal page and personal answer (M6 G4; S1, S4). A guest has no session, so neither call sends a
// cookie; the slug and the opaque token are the only values that name the invitation and the guest, and a slug or
// token that cannot be one sends no request at all. The page's body is the public projection plus one guest block,
// so a body that grows another guest, an owner, or an id is refused whole.

const PROXY_SECRET = randomBytes(32).toString("base64url");
/** The API's own origin for media URLs; the gallery parser accepts no other host (A5). */
const MEDIA_ORIGIN = "http://localhost:3001";

/** One guest page parsed against this deployment's API origin, which is what the client passes. */
const parsePublicGuestInvitation = (value: unknown) =>
  parsePublicGuestInvitationContract(value, MEDIA_ORIGIN);
const SLUG = "invitacion-k7m2qx";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const AT = "2026-11-12T15:30:00.000Z";

const GUEST_PAGE: PublicGuestInvitation = {
  slug: SLUG,
  componentKey: "birthday-poster-01",
  configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
  content: { celebrantName: "Ana", date: "2026-12-05", time: "16:30" },
  // The pinned schema of this fixture omits no section, so the page hides no block (S8.3).
  hiddenFields: [],
  places: {},
  publishedAt: AT,
  timeZone: "America/Mexico_City",
  // The read-only flag the API decided (S2, T3): this personal page still renders and only its answer closes.
  expired: false,
  features: {
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: null,
    music: null,
    giftRegistry: false,
    giftRegistryDetails: null,
    lodging: null,
    itinerary: null,
    gallery: [],
    rsvp: { mode: "guest-list", deadline: "2026-12-01T18:00:00.000Z", partyLimit: 4, qrPass: true },
  },
  guest: {
    name: "Ana Pérez",
    seats: 4,
    response: {
      attending: true,
      partySize: 2,
      companions: [{ name: "Luis", child: false }],
      dietaryNotes: "Sin nueces",
      message: "Con gusto",
    },
    qrPass: true,
  },
};

const SUBMISSION: PublicGuestRsvpSubmission = {
  attending: true,
  partySize: 2,
  companions: [{ name: "Luis", child: false }],
  dietaryNotes: "Sin nueces",
  message: "Con gusto",
};

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
  answer(200, GUEST_PAGE);
});

function client() {
  return createPublicInvitationsClient({
    config: {
      apiOrigin,
      proxySecret: PROXY_SECRET,
      clientIpHeader: "x-invitame-client-ip",
      edgeClientIpHeader: "x-real-ip",
    },
  });
}

describe("personal read", () => {
  it("calls GET /public/invitations/:slug/guests/:token with the secret and no cookie", async () => {
    const result = await client().getGuest(SLUG, TOKEN);

    assert.deepEqual(result, { ok: true, value: GUEST_PAGE });
    assert.equal(received.length, 1);
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/public/invitations/${SLUG}/guests/${TOKEN}`);
    assert.equal(received[0]?.headers.cookie, undefined);
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("carries the hidden fields of the omitted sections the public read sends (S8.3)", async () => {
    answer(200, { ...GUEST_PAGE, hiddenFields: ["message"] });

    const result = await client().getGuest(SLUG, TOKEN);

    assert.deepEqual(result, {
      ok: true,
      value: { ...GUEST_PAGE, hiddenFields: ["message"] },
    });
  });

  it("answers not-found for a 404, and makes no request for a slug or token that cannot be one", async () => {
    answer(404, { code: "PUBLIC_INVITATION_NOT_FOUND" });
    assert.deepEqual(await client().getGuest(SLUG, TOKEN), { ok: false, failure: "not-found" });

    received = [];
    const api = client();

    for (const [slug, token] of [
      ["Invitacion", TOKEN],
      ["../cuenta", TOKEN],
      [SLUG, ""],
      [SLUG, "corto"],
      [SLUG, `${TOKEN}=`],
      [SLUG, `${TOKEN.slice(0, 21)}/`],
    ] as const) {
      assert.deepEqual(await api.getGuest(slug, token), { ok: false, failure: "not-found" }, token);
    }
    assert.deepEqual(received, []);
  });

  it("throws unavailable for a 5xx and invalid-response for a body that breaks the contract", async () => {
    answer(503, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().getGuest(SLUG, TOKEN), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "unavailable");
      return true;
    });

    answer(200, { ...GUEST_PAGE, guest: undefined });
    await assert.rejects(client().getGuest(SLUG, TOKEN), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

describe("personal answer", () => {
  it("posts the answer to the personal route and forwards the guest's address", async () => {
    answer(202, { status: "received" });
    const result = await client().submitGuestRsvp(SLUG, TOKEN, SUBMISSION, {
      clientAddress: "203.0.113.9",
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(received[0]?.method, "POST");
    assert.equal(received[0]?.url, `/public/invitations/${SLUG}/guests/${TOKEN}/rsvp`);
    assert.equal(received[0]?.headers.cookie, undefined);
    assert.equal(received[0]?.headers["x-invitame-client-ip"], "203.0.113.9");
    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), SUBMISSION);
  });

  it("sends no address header when the request carried none", async () => {
    answer(202, { status: "received" });
    await client().submitGuestRsvp(SLUG, TOKEN, SUBMISSION);

    assert.equal(received[0]?.headers["x-invitame-client-ip"], undefined);
  });

  it("maps every refusal to its own failure", async () => {
    const api = client();
    const cases = [
      [400, "INVALID_RSVP", "invalid"],
      [404, "PUBLIC_INVITATION_NOT_FOUND", "not-found"],
      [409, "RSVP_NOT_OPEN", "not-open"],
      [429, "RSVP_RATE_LIMITED", "rate-limited"],
    ] as const;

    for (const [status, code, failure] of cases) {
      answer(status, { code });
      assert.deepEqual(await api.submitGuestRsvp(SLUG, TOKEN, SUBMISSION), {
        ok: false,
        failure,
      });
    }
  });

  it("refuses a success body that is not the fixed one, and a status the contract does not name", async () => {
    answer(202, { status: "stored", id: "leak" });
    await assert.rejects(client().submitGuestRsvp(SLUG, TOKEN, SUBMISSION), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });

    answer(403, { code: "FORBIDDEN" });
    await assert.rejects(client().submitGuestRsvp(SLUG, TOKEN, SUBMISSION), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 403);
      return true;
    });

    answer(503, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().submitGuestRsvp(SLUG, TOKEN, SUBMISSION), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "unavailable");
      return true;
    });
  });

  it("makes no request for a slug or token that cannot be one", async () => {
    const api = client();

    assert.deepEqual(await api.submitGuestRsvp("Invitacion", TOKEN, SUBMISSION), {
      ok: false,
      failure: "not-found",
    });
    assert.deepEqual(await api.submitGuestRsvp(SLUG, "corto", SUBMISSION), {
      ok: false,
      failure: "not-found",
    });
    assert.deepEqual(received, []);
  });
});

describe("parsePublicGuestInvitation", () => {
  it("keeps the public projection plus this guest, and drops every other key", () => {
    const parsed = parsePublicGuestInvitation({
      ...GUEST_PAGE,
      ownerId: "leak",
      guest: { ...GUEST_PAGE.guest, token: "leak", checkedInAt: AT },
    });

    assert.deepEqual(parsed, GUEST_PAGE);
  });

  it("accepts an answer written before the companions existed (F3; L6.1)", () => {
    // The API of the previous release answers no companions and no dietary notes; both read as none.
    const parsed = parsePublicGuestInvitation({
      ...GUEST_PAGE,
      guest: {
        ...GUEST_PAGE.guest,
        response: { attending: true, partySize: 2, message: "Con gusto" },
      },
    });

    assert.deepEqual(parsed?.guest.response, {
      attending: true,
      partySize: 2,
      companions: null,
      dietaryNotes: null,
      message: "Con gusto",
    });
  });

  it("refuses companions the API could not have stored", () => {
    for (const companions of ["Luis", [{ name: "Luis" }], [{ name: 7, child: false }]]) {
      assert.equal(
        parsePublicGuestInvitation({
          ...GUEST_PAGE,
          guest: {
            ...GUEST_PAGE.guest,
            response: { attending: true, partySize: 2, companions, message: null },
          },
        }),
        undefined,
        JSON.stringify(companions),
      );
    }
  });

  it("accepts a guest who has not answered yet", () => {
    const parsed = parsePublicGuestInvitation({
      ...GUEST_PAGE,
      guest: { ...GUEST_PAGE.guest, response: null },
    });

    assert.deepEqual(parsed?.guest.response, null);
  });

  it("refuses a guest block that breaks the contract", () => {
    const broken = [
      { ...GUEST_PAGE, guest: undefined },
      { ...GUEST_PAGE, guest: "Ana" },
      { ...GUEST_PAGE, guest: { ...GUEST_PAGE.guest, name: "" } },
      { ...GUEST_PAGE, guest: { ...GUEST_PAGE.guest, name: "a".repeat(81) } },
      { ...GUEST_PAGE, guest: { ...GUEST_PAGE.guest, seats: 0 } },
      { ...GUEST_PAGE, guest: { ...GUEST_PAGE.guest, seats: 11 } },
      { ...GUEST_PAGE, guest: { ...GUEST_PAGE.guest, qrPass: "si" } },
      {
        ...GUEST_PAGE,
        guest: { ...GUEST_PAGE.guest, response: { attending: true, partySize: 5, message: null } },
      },
      {
        ...GUEST_PAGE,
        guest: {
          ...GUEST_PAGE.guest,
          response: { attending: false, partySize: 2, message: null },
        },
      },
      {
        ...GUEST_PAGE,
        guest: {
          ...GUEST_PAGE.guest,
          response: { attending: true, partySize: 2, message: 7 },
        },
      },
      // The public half is validated again: a guest block never rescues a broken invitation.
      { ...GUEST_PAGE, slug: "Invitacion" },
      { ...GUEST_PAGE, content: null },
    ];

    for (const value of broken) {
      assert.equal(parsePublicGuestInvitation(value), undefined, JSON.stringify(value));
    }
  });
});
