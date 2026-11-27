import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createPublicInvitationsClient,
  type PublicInvitation,
  parsePublicInvitation as parsePublicInvitationContract,
} from "./public-invitations-api.ts";

// The web server's client of the public invitation read (M5 T5; S1, S5, A3, A7). A guest is anonymous:
// the call carries no cookie at all, keeps the web-to-API proxy secret, and maps a 404 to "not found"
// and a 5xx to an outage the page renders as its own unavailable state.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const AT = "2026-11-12T15:30:00.000Z";

/** The origin the API builds its own `/media/<assetId>` URLs from; the gallery parser accepts no other host (A5). */
const MEDIA_ORIGIN = "http://localhost:3001";

/** The public read parsed against this deployment's API origin, which is what the client passes. */
const parsePublicInvitation = (value: unknown) =>
  parsePublicInvitationContract(value, MEDIA_ORIGIN);

const PUBLIC: PublicInvitation = {
  slug: "invitacion-k7m2qx",
  componentKey: "birthday-poster-01",
  configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
  content: {
    celebrantName: "Ana",
    age: 7,
    date: "2026-12-05",
    time: "16:30",
    location: "Jardín Los Pinos",
    address: "Calle Reforma 123",
    mainPhoto: "https://example.com/ana.jpg",
    message: "Ven a celebrar conmigo.",
  },
  publishedAt: AT,
  timeZone: "America/Mexico_City",
  features: {
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: { phone: "+525512345678" },
    music: { url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", provider: "spotify" },
    giftRegistry: true,
    giftRegistryDetails: null,
    lodging: {
      hotels: [
        {
          name: "Hotel Misión",
          distance: "A 5 min",
          bookingUrl: "https://hotelmision.example.com/reserva",
          address: "Av. Juárez 120, Centro",
        },
      ],
      transport: "Habrá camión del hotel al salón a las 19:00.",
    },
    itinerary: {
      items: [
        { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
        { time: "19:30", title: "Recepción y cóctel" },
      ],
    },
    guestbook: null,
    // The album answers null while the package grants no `GUEST_ALBUM` (F8; L11.4).
    guestAlbum: null,
    gallery: [],
    rsvp: { mode: "open", deadline: "2026-12-01T18:00:00.000Z", partyLimit: 4, qrPass: false },
  },
  // The precise-locations slice (S2): the points the API already filtered — MAP granted, and the label still equal to
  // the address the content holds. A package without MAP answers an empty map.
  // The pinned schema of this fixture omits no section, so the page hides no block (S8.3).
  hiddenFields: [],
  places: {},
  // The read-only state the API decided (S2, T3): the page still renders and its RSVP is closed.
  expired: false,
};

/** One guest's open RSVP answer, as the guest page posts it (M6 G3; S4). */
const SUBMISSION = {
  name: "Ana Pérez",
  attending: true,
  partySize: 2,
  companions: [{ name: "Luis", child: false }],
  dietaryNotes: "Sin nueces",
  phone: "+525512345678",
  message: "Con mucho gusto",
  honeypot: "",
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
  answer(200, PUBLIC);
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

describe("public read", () => {
  it("calls GET /public/invitations/:slug with the proxy secret and no cookie", async () => {
    const result = await client().getBySlug(PUBLIC.slug);

    assert.deepEqual(result, { ok: true, value: PUBLIC });
    assert.equal(received.length, 1);
    const request = received[0];
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, `/public/invitations/${PUBLIC.slug}`);
    // A guest has no session: the request carries no cookie, not even an empty one.
    assert.equal(request?.headers.cookie, undefined);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.body, "");
  });

  it("keeps the proxy secret optional, as the API allows outside production", async () => {
    const anonymous = createPublicInvitationsClient({
      config: {
        apiOrigin,
        proxySecret: undefined,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    });

    assert.deepEqual(await anonymous.getBySlug(PUBLIC.slug), { ok: true, value: PUBLIC });
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], undefined);
    assert.equal(received[0]?.headers.cookie, undefined);
  });
});

describe("outcomes", () => {
  it("answers not-found for a 404 and never reads its body", async () => {
    answer(404, { code: "PUBLIC_INVITATION_NOT_FOUND" });

    assert.deepEqual(await client().getBySlug(PUBLIC.slug), { ok: false, failure: "not-found" });
    assert.equal(received.length, 1);
  });

  it("makes no request for a slug that cannot be one", async () => {
    const api = client();

    for (const slug of ["", "Invitacion", "a-", "a".repeat(61), "invitacion--doble", "../cuenta"]) {
      assert.deepEqual(await api.getBySlug(slug), { ok: false, failure: "not-found" }, slug);
    }
    assert.deepEqual(received, []);
  });

  it("throws unavailable for a 5xx, rejected for another refusal, and invalid-response for a body that breaks the contract", async () => {
    answer(503, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().getBySlug(PUBLIC.slug), {
      name: "ApiClientError",
      kind: "unavailable",
      status: 503,
    });

    answer(302, "");
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 302);
      return true;
    });

    answer(200, "not json");
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });

    answer(200, { ...PUBLIC, content: null });
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

describe("parsePublicInvitation", () => {
  it("accepts the documented shape and keeps only the fields the public page uses", () => {
    assert.deepEqual(parsePublicInvitation({ ...PUBLIC, ownerId: "leak", status: "PUBLISHED" }), {
      ...PUBLIC,
    });
    assert.deepEqual(parsePublicInvitation({ ...PUBLIC, publishedAt: null }), {
      ...PUBLIC,
      publishedAt: null,
    });
  });

  it("reads the hidden fields of the omitted sections, and answers none for an older API (S8.3)", () => {
    assert.deepEqual(
      parsePublicInvitation({ ...PUBLIC, hiddenFields: ["message", "age"] })?.hiddenFields,
      ["message", "age"],
    );
    // An API that predates the field renders exactly what it rendered before: nothing is hidden.
    const { hiddenFields: _hidden, ...older } = PUBLIC;

    assert.deepEqual(parsePublicInvitation(older)?.hiddenFields, []);
  });

  it("refuses a hidden list that is not a bounded list of distinct property names", () => {
    for (const hiddenFields of [
      null,
      "message",
      ["message", 7],
      ["message", ""],
      ["message", "m".repeat(61)],
      ["message", "message"],
      Array.from({ length: 41 }, (_value, index) => `field${index}`),
    ]) {
      assert.equal(
        parsePublicInvitation({ ...PUBLIC, hiddenFields }),
        undefined,
        JSON.stringify(hiddenFields),
      );
    }
  });

  it("reads the read-only flag the API decided, and refuses a body that does not state it (S2, T3)", () => {
    assert.equal(parsePublicInvitation(PUBLIC)?.expired, false);
    assert.deepEqual(parsePublicInvitation({ ...PUBLIC, expired: true }), {
      ...PUBLIC,
      expired: true,
    });

    for (const expired of [undefined, null, "true", 1, {}, []]) {
      assert.equal(
        parsePublicInvitation({ ...PUBLIC, expired }),
        undefined,
        JSON.stringify(expired),
      );
    }
  });

  it("refuses a slug, componentKey, configuration, content, or publishedAt that breaks the contract", () => {
    const broken: unknown[] = [
      { ...PUBLIC, slug: "" },
      { ...PUBLIC, slug: "Invitacion K7" },
      { ...PUBLIC, slug: "a".repeat(61) },
      { ...PUBLIC, componentKey: "" },
      { ...PUBLIC, componentKey: 7 },
      { ...PUBLIC, configuration: null },
      { ...PUBLIC, configuration: ["sunset"] },
      { ...PUBLIC, content: null },
      { ...PUBLIC, content: "text" },
      { ...PUBLIC, publishedAt: "yesterday" },
      { ...PUBLIC, publishedAt: 0 },
      null,
      [],
      "text",
    ];

    for (const value of broken) {
      assert.equal(parsePublicInvitation(value), undefined, JSON.stringify(value));
    }

    // The playlist card's metadata (S2): a title and a cover on an allow-listed image host are kept, and a value
    // this deployment does not accept is dropped without losing the link or the rest of the page.
    const music = { url: "https://open.spotify.com/playlist/abc", provider: "spotify" };
    const cover = "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07";

    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: { ...PUBLIC.features, music: { ...music, title: "La boda", coverUrl: cover } },
      })?.features.music,
      { ...music, title: "La boda", coverUrl: cover },
    );
    // A link saved before the lookup existed has neither field, and the card is today's card.
    assert.deepEqual(
      parsePublicInvitation({ ...PUBLIC, features: { ...PUBLIC.features, music } })?.features.music,
      music,
    );
    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          music: { ...music, title: "a".repeat(201), coverUrl: "https://evil.test/cover.jpg" },
        },
      })?.features.music,
      music,
    );
  });

  it("reads the stored zone and the gated features, and refuses any other shape (S4)", () => {
    const broken: unknown[] = [
      { ...PUBLIC, timeZone: undefined },
      { ...PUBLIC, timeZone: "Europe/Madrid" },
      { ...PUBLIC, timeZone: 7 },
      { ...PUBLIC, features: undefined },
      { ...PUBLIC, features: null },
      { ...PUBLIC, features: { ...PUBLIC.features, countdown: "yes" } },
      { ...PUBLIC, features: { ...PUBLIC.features, map: 1 } },
      // Add-to-calendar is always available to a guest, so anything but `true` is not this contract.
      { ...PUBLIC, features: { ...PUBLIC.features, calendar: false } },
      { ...PUBLIC, features: { ...PUBLIC.features, calendar: "true" } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: undefined } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: {} } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: "+525512345678" } },
      // A stored phone is E.164: a national number is not one a guest page reads.
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: { phone: "5512345678" } } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: { phone: 7 } } },
      // The gift registry is the grant the layouts read plus the structured card or null (F2; L4.3).
      { ...PUBLIC, features: { ...PUBLIC.features, giftRegistryDetails: "mesa" } },
      { ...PUBLIC, features: { ...PUBLIC.features, giftRegistry: undefined } },
      { ...PUBLIC, features: { ...PUBLIC.features, giftRegistry: "true" } },
      {
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          giftRegistry: {
            stores: [{ name: "Liverpool", url: "http://x.mx/1" }],
            transfer: null,
            envelopes: false,
            note: null,
          },
        },
      },
      // The itinerary is the moments of the day, or null while the package grants no `ITINERARY` (F1; L3.3).
      { ...PUBLIC, features: { ...PUBLIC.features, itinerary: "17:00 Misa" } },
      { ...PUBLIC, features: { ...PUBLIC.features, itinerary: {} } },
      { ...PUBLIC, features: { ...PUBLIC.features, itinerary: { items: [] } } },
      {
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          itinerary: { version: 1, items: [{ time: "17:00", title: "Misa" }] },
        },
      },
      {
        ...PUBLIC,
        features: { ...PUBLIC.features, itinerary: { items: [{ time: "24:00", title: "Misa" }] } },
      },
      // Music is one allow-listed service with an https link, or null (S7).
      { ...PUBLIC, features: { ...PUBLIC.features, music: undefined } },
      { ...PUBLIC, features: { ...PUBLIC.features, music: "https://open.spotify.com/x" } },
      { ...PUBLIC, features: { ...PUBLIC.features, music: {} } },
      {
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          music: { url: "http://open.spotify.com/x", provider: "spotify" },
        },
      },
      {
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          music: { url: "https://open.spotify.com/x", provider: "Spotify" },
        },
      },
      {
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          music: {
            url: `https://open.spotify.com/${"a".repeat(500)}`,
            provider: "spotify",
          },
        },
      },
    ];

    for (const value of broken) {
      assert.equal(parsePublicInvitation(value), undefined, JSON.stringify(value));
    }
    // Only the documented keys are kept, so a body that grows an extra field inside `features` never reaches
    // the page: the parse answers the contract's own shape.
    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: { ...PUBLIC.features, packageId: "leak" },
      }),
      PUBLIC,
    );
    // An older API answers only the grant, with no card field: the page reads it as the gate and shows no card, so a
    // rolling deploy never refuses an invitation the older API still serves (F2; L4.3; review R3-001).
    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: { ...PUBLIC.features, giftRegistryDetails: undefined },
      }),
      { ...PUBLIC, features: { ...PUBLIC.features, giftRegistryDetails: null } },
    );
    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: {
          countdown: false,
          map: false,
          calendar: true,
          whatsapp: null,
          music: null,
          giftRegistry: false,
          giftRegistryDetails: null,
          lodging: null,
          // The itinerary is null while the package grants no `ITINERARY` or the invitation stores none (F1; L3.3).
          itinerary: null,
          // The gallery is always a list, empty when the package grants no `GALLERY` (M8 S4).
          guestbook: null,
          guestAlbum: null,
          gallery: [],
          rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
        },
      }),
      {
        ...PUBLIC,
        features: {
          countdown: false,
          map: false,
          calendar: true,
          whatsapp: null,
          music: null,
          giftRegistry: false,
          giftRegistryDetails: null,
          lodging: null,
          itinerary: null,
          guestbook: null,
          guestAlbum: null,
          gallery: [],
          rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
        },
      },
    );
  });
});

describe("the itinerary of the public read (F1; L3.3)", () => {
  it("reads the moments the API answers, in its order", () => {
    const parsed = parsePublicInvitation(PUBLIC);

    assert.deepEqual(parsed?.features.itinerary, PUBLIC.features.itinerary);
  });

  it("reads an absent itinerary as none, so an older API body still renders the page", () => {
    const { itinerary: _omitted, ...features } = PUBLIC.features;
    const parsed = parsePublicInvitation({ ...PUBLIC, features });

    assert.equal(parsed?.features.itinerary, null);
  });

  it("reads the API's null as none", () => {
    const parsed = parsePublicInvitation({
      ...PUBLIC,
      features: { ...PUBLIC.features, itinerary: null },
    });

    assert.equal(parsed?.features.itinerary, null);
  });
});

describe("the lodging of the public read (F4; L7.3, L7.5)", () => {
  it("reads the hotels and the transport the API answers, in its order", () => {
    const parsed = parsePublicInvitation(PUBLIC);

    assert.deepEqual(parsed?.features.lodging, PUBLIC.features.lodging);
  });

  it("reads an absent lodging as none, so an older API body still renders the page (L20)", () => {
    const { lodging: _omitted, ...features } = PUBLIC.features;
    const parsed = parsePublicInvitation({ ...PUBLIC, features });

    assert.equal(parsed?.features.lodging, null);
  });

  it("reads the API's null as none", () => {
    const parsed = parsePublicInvitation({
      ...PUBLIC,
      features: { ...PUBLIC.features, lodging: null },
    });

    assert.equal(parsed?.features.lodging, null);
  });

  it("refuses a lodging that is not this contract, so no value written around the API reaches a guest", () => {
    for (const broken of [
      "Hotel Misión",
      { hotels: "Hotel Misión", transport: null },
      { hotels: [{ name: "Hotel Misión" }] },
      { hotels: [{ name: "Hotel Misión", bookingUrl: "http://hotel.test" }], transport: null },
      { hotels: Array.from({ length: 7 }, () => ({ name: "Hotel" })), transport: null },
      { hotels: [], transport: 7 },
    ]) {
      assert.equal(
        parsePublicInvitation({
          ...PUBLIC,
          features: { ...PUBLIC.features, lodging: broken },
        }),
        undefined,
        JSON.stringify(broken),
      );
    }
  });
});

describe("the RSVP feature of the public read (M6 G3; S4)", () => {
  it("reads how the page accepts answers: open, the guest list, or nothing at all", () => {
    for (const rsvp of [
      { mode: "open" as const, deadline: null, partyLimit: 4, qrPass: false },
      {
        mode: "guest-list" as const,
        deadline: "2026-12-01T18:00:00.000Z",
        partyLimit: 10,
        qrPass: true,
      },
      { mode: null, deadline: null, partyLimit: 1, qrPass: false },
    ]) {
      assert.deepEqual(
        parsePublicInvitation({ ...PUBLIC, features: { ...PUBLIC.features, rsvp } }),
        {
          ...PUBLIC,
          features: { ...PUBLIC.features, rsvp },
        },
      );
    }
  });

  it("refuses an unknown mode, a deadline that is no instant, or a party limit outside 1 to 10", () => {
    const broken: unknown[] = [
      undefined,
      null,
      "open",
      {},
      { mode: "guests", deadline: null, partyLimit: 4, qrPass: false },
      { mode: "open", partyLimit: 4, qrPass: false },
      { mode: "open", deadline: "mañana", partyLimit: 4, qrPass: false },
      { mode: "open", deadline: 0, partyLimit: 4, qrPass: false },
      { mode: "open", deadline: null, partyLimit: 0, qrPass: false },
      { mode: "open", deadline: null, partyLimit: 11, qrPass: false },
      { mode: "open", deadline: null, partyLimit: 2.5, qrPass: false },
      { mode: "open", deadline: null, partyLimit: "4", qrPass: false },
      // The pass is a boolean the guest list reads; anything else is not this contract (M6 G2; S4).
      { mode: "guest-list", deadline: null, partyLimit: 4 },
      { mode: "guest-list", deadline: null, partyLimit: 4, qrPass: "true" },
      { mode: "open", deadline: null, partyLimit: 4, qrPass: null },
    ];

    for (const rsvp of broken) {
      assert.equal(
        parsePublicInvitation({ ...PUBLIC, features: { ...PUBLIC.features, rsvp } }),
        undefined,
        JSON.stringify(rsvp),
      );
    }
  });
});

describe("public RSVP submission (M6 G3; S4)", () => {
  it("posts the guest's answer to the slug with the address the web forwarded and no cookie", async () => {
    answer(202, { status: "received" });

    const result = await client().submitRsvp(PUBLIC.slug, SUBMISSION, {
      clientAddress: "203.0.113.7",
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(received.length, 1);
    const request = received[0];
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, `/public/invitations/${PUBLIC.slug}/rsvp`);
    // A guest has no session, and the API counts the answer against the guest's own address.
    assert.equal(request?.headers.cookie, undefined);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.headers["x-invitame-client-ip"], "203.0.113.7");
    assert.equal(request?.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(request?.body ?? "null"), SUBMISSION);
  });

  it("forwards no address header when the web could not read one", async () => {
    answer(202, { status: "received" });

    assert.deepEqual(await client().submitRsvp(PUBLIC.slug, SUBMISSION), { ok: true });
    assert.equal(received[0]?.headers["x-invitame-client-ip"], undefined);
  });

  it("makes no request for a slug that cannot be one", async () => {
    for (const slug of ["", "Invitacion", "a-", "invitacion--doble", "../cuenta"]) {
      assert.deepEqual(await client().submitRsvp(slug, SUBMISSION), {
        ok: false,
        failure: "not-found",
      });
    }
    assert.deepEqual(received, []);
  });

  it("maps each documented refusal to its own outcome", async () => {
    const refusals: Array<[number, unknown, string]> = [
      [404, { code: "PUBLIC_INVITATION_NOT_FOUND" }, "not-found"],
      [409, { code: "RSVP_NOT_OPEN" }, "not-open"],
      [429, { code: "RSVP_RATE_LIMITED" }, "rate-limited"],
      [
        400,
        { code: "INVALID_RSVP", issues: ["name must be between 1 and 80 characters"] },
        "invalid",
      ],
    ];

    for (const [status, body, failure] of refusals) {
      answer(status, body);
      assert.deepEqual(
        await client().submitRsvp(PUBLIC.slug, SUBMISSION),
        { ok: false, failure },
        `${status}`,
      );
    }
  });

  it("fails closed on a refusal this deployment does not implement and on an accepted body that breaks the contract", async () => {
    answer(400, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().submitRsvp(PUBLIC.slug, SUBMISSION), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      return true;
    });

    answer(503, { code: "SERVICE_UNAVAILABLE" });
    await assert.rejects(client().submitRsvp(PUBLIC.slug, SUBMISSION), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "unavailable");
      return true;
    });

    answer(202, { status: "stored", name: "Ana Pérez" });
    await assert.rejects(client().submitRsvp(PUBLIC.slug, SUBMISSION), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

// The guestbook of the public read and the signature on it (F7; L10.3, L10.4): the API answers the wall only while the
// package grants the key, and a signature is a POST the page's server action makes with the guest's address.
const GUESTBOOK_ENTRIES = [
  { authorName: "Sofía y Jorge", message: "Nos vemos en la pista." },
  { authorName: "Tía Rosa", message: "<b>¡Felicidades!</b> https://spam.example" },
];

const SIGNATURE = {
  authorName: "Tía Rosa",
  message: "¡Que sea un día hermoso!",
  honeypot: "",
};

describe("the guestbook of the public read (F7; L10.4, L20)", () => {
  it("reads the visible entries the API answers, in its order, as plain text", () => {
    const page = parsePublicInvitation({
      ...PUBLIC,
      features: { ...PUBLIC.features, guestbook: GUESTBOOK_ENTRIES },
    });

    assert.deepEqual(page?.features.guestbook, GUESTBOOK_ENTRIES);
    // The markup a guest typed stays characters: nothing here turns it into a link or an element.
    assert.equal(
      page?.features.guestbook?.[1]?.message,
      "<b>¡Felicidades!</b> https://spam.example",
    );
  });

  it("reads the API's null as no wall, and an empty list as a granted wall with no message", () => {
    assert.equal(
      parsePublicInvitation({ ...PUBLIC, features: { ...PUBLIC.features, guestbook: null } })
        ?.features.guestbook,
      null,
    );
    assert.deepEqual(
      parsePublicInvitation({ ...PUBLIC, features: { ...PUBLIC.features, guestbook: [] } })
        ?.features.guestbook,
      [],
    );
  });

  it("reads an absent guestbook as no wall, so an older API body keeps rendering (L20)", () => {
    const { guestbook: _guestbook, ...features } = PUBLIC.features;
    const page = parsePublicInvitation({ ...PUBLIC, features });

    assert.equal(page?.features.guestbook, null);
  });

  it("refuses a wall past the API's own bound or an entry that is not this contract", () => {
    for (const guestbook of [
      Array.from({ length: 51 }, () => ({ authorName: "Rosa", message: "Hola" })),
      [{ authorName: "x".repeat(61), message: "Hola" }],
      [{ authorName: "Rosa", message: "x".repeat(501) }],
      [{ authorName: "", message: "Hola" }],
      [{ authorName: "Rosa" }],
      "not-a-list",
    ]) {
      assert.equal(
        parsePublicInvitation({ ...PUBLIC, features: { ...PUBLIC.features, guestbook } }),
        undefined,
        JSON.stringify(guestbook).slice(0, 60),
      );
    }
    // A field the wall does not define is dropped instead of reaching a guest: the projection keeps the two texts.
    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: {
          ...PUBLIC.features,
          guestbook: [{ authorName: "Rosa", message: "Hola", hidden: true, id: "x" }],
        },
      })?.features.guestbook,
      [{ authorName: "Rosa", message: "Hola" }],
    );
  });
});

describe("public guestbook submission (F7; L10.3)", () => {
  it("posts the signature to the slug with the address the web forwarded and no cookie", async () => {
    answer(202, { status: "received" });

    const result = await client().submitGuestbook(PUBLIC.slug, SIGNATURE, {
      clientAddress: "203.0.113.11",
    });

    assert.deepEqual(result, { ok: true });
    const request = received[0];
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, `/public/invitations/${PUBLIC.slug}/guestbook`);
    assert.equal(request?.headers.cookie, undefined);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.headers["x-invitame-client-ip"], "203.0.113.11");
    assert.deepEqual(JSON.parse(request?.body ?? "null"), SIGNATURE);
  });

  it("makes no request for a slug that cannot be one", async () => {
    for (const slug of ["", "Invitacion", "invitacion--doble", "../cuenta"]) {
      assert.deepEqual(await client().submitGuestbook(slug, SIGNATURE), {
        ok: false,
        failure: "not-found",
      });
    }
    assert.deepEqual(received, []);
  });

  it("maps each documented refusal to its own outcome", async () => {
    const refusals: Array<[number, unknown, string]> = [
      [404, { code: "PUBLIC_INVITATION_NOT_FOUND" }, "not-found"],
      [409, { code: "GUESTBOOK_CLOSED" }, "closed"],
      [429, { code: "GUESTBOOK_RATE_LIMITED" }, "rate-limited"],
      [
        400,
        {
          code: "INVALID_GUESTBOOK_ENTRY",
          issues: ["message must be between 1 and 500 characters"],
        },
        "invalid",
      ],
    ];

    for (const [status, body, failure] of refusals) {
      answer(status, body);
      assert.deepEqual(
        await client().submitGuestbook(PUBLIC.slug, SIGNATURE),
        { ok: false, failure },
        `${status}`,
      );
    }
  });

  it("fails closed on a refusal this deployment does not implement and on an accepted body that breaks the contract", async () => {
    answer(409, { code: "RSVP_NOT_OPEN" });
    await assert.rejects(client().submitGuestbook(PUBLIC.slug, SIGNATURE), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      return true;
    });

    answer(202, { status: "stored" });
    await assert.rejects(client().submitGuestbook(PUBLIC.slug, SIGNATURE), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

// The gallery of the public read (M8 S3, S4): the API answers the photos in position order, each with the dimensions a
// layout reserves and the creator's alt text, and an empty array when the package does not grant `GALLERY`.
const GALLERY_PHOTOS = [
  {
    url: "http://localhost:3001/media/9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19",
    width: 1200,
    height: 800,
    alt: "Los novios en el jardín",
  },
  {
    url: "http://localhost:3001/media/8b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e18",
    width: 800,
    height: 1200,
    alt: null,
  },
];

/** The public read of one invitation, with its gallery replaced. */
function withGallery(gallery: unknown): unknown {
  return { ...PUBLIC, features: { ...PUBLIC.features, gallery } };
}

describe("the gallery of the public read (M8 S3, S4)", () => {
  it("keeps the photos in the API's order, with their dimensions and alt text", () => {
    const parsed = parsePublicInvitation(withGallery(GALLERY_PHOTOS));

    assert.deepEqual(parsed?.features.gallery, GALLERY_PHOTOS);
  });

  it("accepts an empty gallery, which is what a package without GALLERY answers", () => {
    assert.deepEqual(parsePublicInvitation(withGallery([]))?.features.gallery, []);
  });

  it("refuses a gallery photo whose host is not the API origin this deployment reads", async () => {
    // The guest page renders each photo as an `<img src>`, so a foreign host never reaches it (A5).
    const foreign = [{ ...GALLERY_PHOTOS[0], url: "https://evil.example/media/9b6f3e0e" }];
    assert.equal(parsePublicInvitation(withGallery(foreign)), undefined);
    // A URL of the same origin with an unexpected path is still this contract; only the host is the rule.
    assert.deepEqual(
      parsePublicInvitation(withGallery([{ ...GALLERY_PHOTOS[0], url: `${MEDIA_ORIGIN}/media/x` }]))
        ?.features.gallery,
      [{ ...GALLERY_PHOTOS[0], url: `${MEDIA_ORIGIN}/media/x` }],
    );

    answer(200, withGallery(foreign));
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });

  it("refuses a gallery that is not a list of the documented photos", () => {
    const broken: unknown[] = [
      null,
      undefined,
      "gallery",
      {},
      [null],
      [{ ...GALLERY_PHOTOS[0], url: "javascript:alert(1)" }],
      [{ ...GALLERY_PHOTOS[0], url: "/media/relative" }],
      [{ ...GALLERY_PHOTOS[0], url: "http://user:secret@localhost:3001/media/x" }],
      // Defence in depth (A5): a gallery URL on any host but the configured API origin is refused whole.
      [{ ...GALLERY_PHOTOS[0], url: "https://evil.example/media/9b6f3e0e" }],
      [{ ...GALLERY_PHOTOS[0], url: "http://localhost:3001.evil.example/media/9b6f3e0e" }],
      [{ ...GALLERY_PHOTOS[0], url: "https://localhost:3001/media/9b6f3e0e" }],
      [{ ...GALLERY_PHOTOS[0], width: 0 }],
      [{ ...GALLERY_PHOTOS[0], width: 1.5 }],
      [{ ...GALLERY_PHOTOS[0], height: -1 }],
      [{ ...GALLERY_PHOTOS[0], alt: 7 }],
      [{ ...GALLERY_PHOTOS[0], alt: "x".repeat(121) }],
      Array.from({ length: 13 }, () => GALLERY_PHOTOS[0]),
    ];

    for (const gallery of broken) {
      assert.equal(parsePublicInvitation(withGallery(gallery)), undefined, JSON.stringify(gallery));
    }
  });
});

// The stored points of a guest page (S1, S2). The API decides which ones a guest may see; this client only reads the
// documented shape, so a body that grows another key or a broken point is refused instead of being rendered.

describe("the places of the public read (S1, S2)", () => {
  const PARROQUIA = { label: "Parroquia de San José, Querétaro", lat: 20.588793, lng: -100.389888 };

  it("reads the confirmed points keyed by address field", async () => {
    answer(200, { ...PUBLIC, places: { address: PARROQUIA } });

    const result = await client().getBySlug(PUBLIC.slug);

    assert.deepEqual(result.ok && result.value.places, { address: PARROQUIA });
  });

  it("refuses a map keyed by anything but an address field, or holding a point outside its bounds", () => {
    for (const places of [
      undefined,
      null,
      [],
      "Parroquia",
      { celebrantName: PARROQUIA },
      { address: { label: "Sin coordenadas" } },
      { address: { label: "Lejos", lat: 20.5, lng: 181 } },
      { address: { label: "", lat: 20.5, lng: -100 } },
    ]) {
      assert.equal(parsePublicInvitation({ ...PUBLIC, places }), undefined, JSON.stringify(places));
    }
  });

  it("keeps a package without MAP on an empty map", () => {
    const unconfirmed = parsePublicInvitation({ ...PUBLIC, places: {} });

    assert.deepEqual(unconfirmed?.places, {});
  });
});

// The album of the guests' photos (F8; S2.8, L11.4, L11.5): the public read answers the published photos newest first,
// at most 60, with the name each uploader typed, and null while the package grants no `GUEST_ALBUM`. The guest's upload
// is multipart to the slug's own route, and every refusal the API documents has its own outcome here.
const ALBUM_PHOTO = {
  url: `${MEDIA_ORIGIN}/media/9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19`,
  uploaderName: "Tía Rosa",
};

/** The public read of one invitation, with its album replaced. */
function withAlbum(guestAlbum: unknown): unknown {
  return { ...PUBLIC, features: { ...PUBLIC.features, guestAlbum } };
}

describe("the album of the public read (F8; L11.4)", () => {
  it("keeps the published photos in the API's order, with the album's own count", () => {
    const page = parsePublicInvitation(withAlbum({ photos: [ALBUM_PHOTO], count: 12 }));

    assert.deepEqual(page?.features.guestAlbum, { photos: [ALBUM_PHOTO], count: 12 });
    // An album nobody has published to is still granted: an empty list, so the page offers its form (L11.5).
    assert.deepEqual(
      parsePublicInvitation(withAlbum({ photos: [], count: 0 }))?.features.guestAlbum,
      { photos: [], count: 0 },
    );
  });

  it("reads an absent album as none, so a page deployed before F8 keeps rendering (L20)", () => {
    const { guestAlbum: _guestAlbum, ...features } = PUBLIC.features;

    assert.equal(parsePublicInvitation({ ...PUBLIC, features })?.features.guestAlbum, null);
    assert.equal(parsePublicInvitation(withAlbum(null))?.features.guestAlbum, null);
  });

  it("refuses an album past the API's own bounds or a photo that is not this contract", () => {
    for (const guestAlbum of [
      { photos: Array.from({ length: 61 }, () => ALBUM_PHOTO), count: 61 },
      { photos: [ALBUM_PHOTO], count: -1 },
      { photos: [ALBUM_PHOTO], count: 1.5 },
      { photos: [ALBUM_PHOTO] },
      { photos: "none", count: 0 },
      { photos: [{ ...ALBUM_PHOTO, url: "https://evil.example/media/x" }], count: 1 },
      { photos: [{ ...ALBUM_PHOTO, url: "/media/relative" }], count: 1 },
      { photos: [{ ...ALBUM_PHOTO, uploaderName: "x".repeat(61) }], count: 1 },
      { photos: [{ ...ALBUM_PHOTO, uploaderName: "" }], count: 1 },
      { photos: [{ ...ALBUM_PHOTO, uploaderName: 7 }], count: 1 },
      { photos: [null], count: 1 },
      "album",
    ]) {
      assert.equal(
        parsePublicInvitation(withAlbum(guestAlbum)),
        undefined,
        JSON.stringify(guestAlbum).slice(0, 80),
      );
    }
  });

  it("drops a field the album does not define, so nothing else reaches a guest", () => {
    const page = parsePublicInvitation(
      withAlbum({
        photos: [{ ...ALBUM_PHOTO, id: "leak", storageKey: "invitations/x/y.webp" }],
        count: 1,
        pendingCount: 3,
      }),
    );

    assert.deepEqual(page?.features.guestAlbum, { photos: [ALBUM_PHOTO], count: 1 });
  });
});

describe("the guest's photo upload (F8; L11.3, L11.5)", () => {
  const UPLOAD = {
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02]),
    uploaderName: "Tía Rosa",
  };

  it("posts one multipart file to the slug's own route with the address the web forwarded and no cookie", async () => {
    answer(202, { status: "received" });

    const result = await client().uploadGuestPhoto(PUBLIC.slug, UPLOAD, {
      clientAddress: "203.0.113.11",
    });

    assert.deepEqual(result, { ok: true });
    const request = received[0];
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, `/public/invitations/${PUBLIC.slug}/photos`);
    assert.equal(request?.headers.cookie, undefined);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.headers["x-invitame-client-ip"], "203.0.113.11");
    // The browser's own file name and MIME type never travel: the API decides the format from the bytes (L11.3).
    assert.match(request?.headers["content-type"] ?? "", /^multipart\/form-data; boundary=/);
    assert.match(request?.body ?? "", /name="file"; filename="photo"/);
    assert.match(request?.body ?? "", /name="uploaderName"/);
    assert.match(request?.body ?? "", /Tía Rosa/);
  });

  it("sends no name when the guest left it empty, which the API stores as none", async () => {
    answer(202, { status: "received" });

    await client().uploadGuestPhoto(PUBLIC.slug, { bytes: UPLOAD.bytes, uploaderName: null });

    assert.doesNotMatch(received[0]?.body ?? "", /name="uploaderName"/);
    assert.equal(received[0]?.headers["x-invitame-client-ip"], undefined);
  });

  it("makes no request for a slug that cannot be one", async () => {
    for (const slug of ["", "Invitacion", "invitacion--doble", "../cuenta"]) {
      assert.deepEqual(await client().uploadGuestPhoto(slug, UPLOAD), {
        ok: false,
        failure: "not-found",
      });
    }
    assert.deepEqual(received, []);
  });

  it("maps each documented refusal to its own outcome", async () => {
    const refusals: Array<[number, unknown, string]> = [
      [404, { code: "PUBLIC_INVITATION_NOT_FOUND" }, "not-found"],
      [409, { code: "GUEST_ALBUM_CLOSED" }, "closed"],
      [409, { code: "GUEST_ALBUM_FULL" }, "full"],
      [429, { code: "GUEST_ALBUM_RATE_LIMITED" }, "rate-limited"],
      [
        400,
        { code: "INVALID_GUEST_PHOTO", issues: ["file must be a JPEG, PNG, or WebP image"] },
        "invalid",
      ],
      [400, { code: "INVALID_MEDIA_UPLOAD" }, "invalid"],
      [413, { code: "PAYLOAD_TOO_LARGE" }, "invalid"],
      [415, { code: "UNSUPPORTED_MEDIA_TYPE" }, "invalid"],
    ];

    for (const [status, body, failure] of refusals) {
      answer(status, body);
      assert.deepEqual(
        await client().uploadGuestPhoto(PUBLIC.slug, UPLOAD),
        { ok: false, failure },
        `${status}`,
      );
    }
  });

  it("fails closed on a refusal this deployment does not implement and on an accepted body that breaks the contract", async () => {
    answer(409, { code: "RSVP_NOT_OPEN" });
    await assert.rejects(client().uploadGuestPhoto(PUBLIC.slug, UPLOAD), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      return true;
    });

    answer(202, { status: "stored" });
    await assert.rejects(client().uploadGuestPhoto(PUBLIC.slug, UPLOAD), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});
