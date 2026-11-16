import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createInvitationsClient,
  type GuestCheckIn,
  type GuestItem,
  type GuestList,
  type GuestWithToken,
  isGuestToken,
  parseDeletedGuest,
  parseGuestCheckIn,
  parseGuestItem,
  parseGuestList,
  parseGuestWithToken,
} from "./invitations-api.ts";

// The creator's guest-list routes (M6 G4; S1, S4). The client is the same signed-in invitation client the rest of
// the customer pages use, so these tests prove three things: the exact request each method sends, the refusal
// each documented error code maps to, and that a success whose body does not match the contract is refused
// whole — including the personal token, which is 22 base64url characters and is answered exactly once.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const INVITATION_ID = "0b8f2a3c-4d5e-4f60-8a91-2b3c4d5e6f70";
const GUEST_ID = "1c9e3b4d-5e6f-4a71-9b02-3c4d5e6f7a81";
const AT = "2026-11-12T15:30:00.000Z";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const GUEST: GuestItem = {
  id: GUEST_ID,
  name: "Ana Pérez",
  seats: 4,
  phone: "+525512345678",
  note: "Mesa de la familia",
  tokenIssuedAt: AT,
  checkedInAt: null,
  response: {
    attending: true,
    partySize: 2,
    message: "Con gusto",
    createdAt: AT,
    updatedAt: AT,
  },
  createdAt: AT,
  updatedAt: AT,
};

const TOTALS: GuestList["totals"] = {
  guests: 1,
  seats: 4,
  attendingGuests: 1,
  attendingPeople: 2,
  declinedCount: 0,
  pendingCount: 0,
  checkedInCount: 0,
};

const LIST: GuestList = { guests: [GUEST], totals: TOTALS };
const WITH_TOKEN: GuestWithToken = { guest: GUEST, token: TOKEN };
const CHECK_IN: GuestCheckIn = {
  guestId: GUEST_ID,
  name: "Ana Pérez",
  seats: 4,
  attendingPartySize: 2,
  checkedInAt: AT,
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
  answer(200, LIST);
});

const cookieHeader = () => Promise.resolve("better-auth.session_token=abc; other=1");

function client() {
  return createInvitationsClient(
    {
      config: {
        apiOrigin,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    },
    cookieHeader,
  );
}

describe("guest list read", () => {
  it("calls GET /invitations/:id/guests with the session cookie and the secret", async () => {
    const result = await client().guests(INVITATION_ID);

    assert.deepEqual(result, { ok: true, value: LIST });
    assert.equal(received.length, 1);
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/invitations/${INVITATION_ID}/guests`);
    // Only Better Auth's cookie is forwarded, and the shared secret proves the web-to-API hop.
    assert.equal(received[0]?.headers.cookie, "better-auth.session_token=abc");
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("maps a 404 to not-found and a package without the guest list to guest-list-unavailable", async () => {
    answer(404, { code: "INVITATION_NOT_FOUND" });
    assert.deepEqual(await client().guests(INVITATION_ID), { ok: false, failure: "not-found" });

    answer(409, { code: "GUEST_LIST_NOT_AVAILABLE" });
    assert.deepEqual(await client().guests(INVITATION_ID), {
      ok: false,
      failure: "guest-list-unavailable",
    });
  });

  it("makes no request for an id that is not a UUID, and answers signed-out for a 401", async () => {
    assert.deepEqual(await client().guests("../../etc"), { ok: false, failure: "not-found" });
    assert.deepEqual(received, []);

    answer(401, { code: "UNAUTHORIZED" });
    assert.deepEqual(await client().guests(INVITATION_ID), { ok: false, failure: "signed-out" });
  });
});

describe("guest writes", () => {
  it("posts the whole guest and reads the personal token exactly once", async () => {
    answer(201, WITH_TOKEN);
    const result = await client().createGuest(INVITATION_ID, {
      name: "Ana Pérez",
      seats: 4,
      phone: "+525512345678",
      note: "Mesa de la familia",
    });

    assert.deepEqual(result, { ok: true, value: WITH_TOKEN });
    assert.equal(received[0]?.method, "POST");
    assert.equal(received[0]?.url, `/invitations/${INVITATION_ID}/guests`);
    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), {
      name: "Ana Pérez",
      seats: 4,
      phone: "+525512345678",
      note: "Mesa de la familia",
    });
  });

  it("sends null for a phone and a note the creator left empty", async () => {
    answer(201, WITH_TOKEN);
    await client().createGuest(INVITATION_ID, {
      name: "Ana Pérez",
      seats: 1,
      phone: null,
      note: null,
    });

    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), {
      name: "Ana Pérez",
      seats: 1,
      phone: null,
      note: null,
    });
  });

  it("replaces a guest with PUT and removes it with DELETE", async () => {
    answer(200, GUEST);
    const edited = await client().updateGuest(INVITATION_ID, GUEST_ID, {
      name: "Ana P. Ruiz",
      seats: 2,
      phone: null,
      note: null,
    });

    assert.deepEqual(edited, { ok: true, value: GUEST });
    assert.equal(received[0]?.method, "PUT");
    assert.equal(received[0]?.url, `/invitations/${INVITATION_ID}/guests/${GUEST_ID}`);

    received = [];
    answer(200, { status: "deleted" });
    assert.deepEqual(await client().removeGuest(INVITATION_ID, GUEST_ID), {
      ok: true,
      value: { status: "deleted" },
    });
    assert.equal(received[0]?.method, "DELETE");
  });

  it("never sends a write for a guest id that is not a UUID, and names no invitation for a bad one", async () => {
    const api = client();

    assert.deepEqual(await api.removeGuest(INVITATION_ID, "abc"), {
      ok: false,
      failure: "guest-not-found",
    });
    assert.deepEqual(await api.rotateGuestToken(INVITATION_ID, "abc"), {
      ok: false,
      failure: "guest-not-found",
    });
    assert.deepEqual(await api.guests("../../etc"), { ok: false, failure: "not-found" });
    assert.deepEqual(received, []);
  });

  it("maps every documented refusal of a write to its own failure", async () => {
    const api = client();

    answer(400, { code: "INVALID_GUEST", issues: ["seats must be between 1 and 10"] });
    assert.deepEqual(await api.createGuest(INVITATION_ID, { name: "Ana", seats: 11 }), {
      ok: false,
      failure: "invalid-guest",
      issues: ["seats must be between 1 and 10"],
    });

    answer(404, { code: "GUEST_NOT_FOUND" });
    assert.deepEqual(await api.removeGuest(INVITATION_ID, GUEST_ID), {
      ok: false,
      failure: "guest-not-found",
    });

    answer(409, { code: "GUEST_SEATS_BELOW_RESPONSE" });
    assert.deepEqual(await api.updateGuest(INVITATION_ID, GUEST_ID, { name: "Ana", seats: 1 }), {
      ok: false,
      failure: "guest-seats-below-response",
    });

    answer(409, { code: "INVITATION_NOT_EDITABLE" });
    assert.deepEqual(await api.removeGuest(INVITATION_ID, GUEST_ID), {
      ok: false,
      failure: "not-editable",
    });

    answer(409, { code: "GUEST_LIST_NOT_AVAILABLE" });
    assert.deepEqual(await api.rotateGuestToken(INVITATION_ID, GUEST_ID), {
      ok: false,
      failure: "guest-list-unavailable",
    });
  });

  it("rotates the personal link with POST and reads the new token once", async () => {
    answer(200, WITH_TOKEN);
    assert.deepEqual(await client().rotateGuestToken(INVITATION_ID, GUEST_ID), {
      ok: true,
      value: WITH_TOKEN,
    });
    assert.equal(received[0]?.method, "POST");
    assert.equal(received[0]?.url, `/invitations/${INVITATION_ID}/guests/${GUEST_ID}/token`);
    assert.equal(received[0]?.body, "");
  });
});

describe("check-in", () => {
  it("posts the token of the QR URL and reads the first check-in instant", async () => {
    answer(200, CHECK_IN);
    assert.deepEqual(await client().checkInGuest(INVITATION_ID, TOKEN), {
      ok: true,
      value: CHECK_IN,
    });
    assert.equal(received[0]?.method, "POST");
    assert.equal(received[0]?.url, `/invitations/${INVITATION_ID}/guests/check-in`);
    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), { token: TOKEN });
  });

  it("maps a guest who has not confirmed, a missing pass, and an unknown guest", async () => {
    const api = client();

    answer(409, { code: "GUEST_NOT_CONFIRMED" });
    assert.deepEqual(await api.checkInGuest(INVITATION_ID, TOKEN), {
      ok: false,
      failure: "guest-not-confirmed",
    });

    answer(409, { code: "QR_PASS_NOT_AVAILABLE" });
    assert.deepEqual(await api.checkInGuest(INVITATION_ID, TOKEN), {
      ok: false,
      failure: "qr-pass-unavailable",
    });

    answer(404, { code: "GUEST_NOT_FOUND" });
    assert.deepEqual(await api.checkInGuest(INVITATION_ID, TOKEN), {
      ok: false,
      failure: "guest-not-found",
    });

    answer(404, { code: "INVITATION_NOT_FOUND" });
    assert.deepEqual(await api.checkInGuest(INVITATION_ID, TOKEN), {
      ok: false,
      failure: "not-found",
    });
  });

  it("makes no request for a token that cannot have been minted", async () => {
    const api = client();

    for (const token of ["", "corto", `${TOKEN}=`, "!!!!!!!!!!!!!!!!!!!!!!", TOKEN.slice(0, 21)]) {
      assert.deepEqual(await api.checkInGuest(INVITATION_ID, token), {
        ok: false,
        failure: "guest-not-found",
      });
    }
    assert.deepEqual(received, []);
  });
});

describe("strict parsers", () => {
  it("keeps only the guest fields the creator page renders", () => {
    assert.deepEqual(parseGuestItem({ ...GUEST, token: "leak", ownerId: "leak" }), GUEST);
    assert.deepEqual(parseGuestItem({ ...GUEST, response: null }), { ...GUEST, response: null });
    assert.deepEqual(parseGuestItem({ ...GUEST, phone: null, note: null }), {
      ...GUEST,
      phone: null,
      note: null,
    });
  });

  it("refuses a guest whose seats, name, answer, or timestamps break the contract", () => {
    const broken: unknown[] = [
      { ...GUEST, seats: 0 },
      { ...GUEST, seats: 11 },
      { ...GUEST, seats: 1.5 },
      { ...GUEST, seats: "4" },
      { ...GUEST, name: "" },
      { ...GUEST, name: "a".repeat(81) },
      { ...GUEST, phone: 5512345678 },
      { ...GUEST, note: 7 },
      { ...GUEST, checkedInAt: "ayer" },
      { ...GUEST, tokenIssuedAt: null },
      { ...GUEST, response: { ...GUEST.response, partySize: 5 } },
      { ...GUEST, response: { ...GUEST.response, attending: "si" } },
      { ...GUEST, response: { attending: false, partySize: 0 } },
      null,
      [],
    ];

    for (const value of broken) {
      assert.equal(parseGuestItem(value), undefined, JSON.stringify(value));
    }
  });

  it("refuses totals that are not non-negative whole counts", () => {
    const broken: unknown[] = [
      { ...TOTALS, guests: -1 },
      { ...TOTALS, seats: 1.5 },
      { ...TOTALS, attendingPeople: "2" },
      null,
      // A list whose totals are missing a count is not this contract.
      { guests: [GUEST], totals: { ...TOTALS, checkedInCount: undefined } },
    ];

    for (const value of broken) {
      assert.equal(parseGuestList(value), undefined, JSON.stringify(value));
    }
  });

  it("accepts a list and refuses one guest inside it that breaks the contract", () => {
    assert.deepEqual(parseGuestList(LIST), LIST);
    assert.equal(
      parseGuestList({ guests: [GUEST, { ...GUEST, seats: 0 }], totals: TOTALS }),
      undefined,
    );
    assert.equal(parseGuestList({ guests: "ninguno", totals: TOTALS }), undefined);
  });

  it("refuses a token that is not 22 base64url characters", () => {
    assert.equal(isGuestToken(TOKEN), true);

    for (const token of ["", "a", `${TOKEN}=`, "a".repeat(23), `${TOKEN.slice(0, 21)}+`, null, 7]) {
      assert.equal(isGuestToken(token), false, String(token));
    }
    assert.equal(parseGuestWithToken({ ...WITH_TOKEN, token: "corto" }), undefined);
    assert.equal(parseGuestWithToken({ guest: { ...GUEST, seats: 0 }, token: TOKEN }), undefined);
    assert.deepEqual(parseGuestWithToken(WITH_TOKEN), WITH_TOKEN);
  });

  it("reads the removal answer and refuses another status", () => {
    assert.deepEqual(parseDeletedGuest({ status: "deleted" }), { status: "deleted" });
    assert.equal(parseDeletedGuest({ status: "ok" }), undefined);
    assert.equal(parseDeletedGuest(null), undefined);
  });

  it("reads one check-in and refuses a body that names no party", () => {
    assert.deepEqual(parseGuestCheckIn(CHECK_IN), CHECK_IN);
    for (const value of [
      { ...CHECK_IN, attendingPartySize: 5 },
      { ...CHECK_IN, seats: 0 },
      { ...CHECK_IN, checkedInAt: "" },
      { ...CHECK_IN, name: "" },
      null,
    ]) {
      assert.equal(parseGuestCheckIn(value), undefined, JSON.stringify(value));
    }
  });

  it("fails closed on a success body that does not match the contract", async () => {
    answer(200, { guests: [{ ...GUEST, seats: 0 }], totals: TOTALS });
    await assert.rejects(client().guests(INVITATION_ID), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });

    answer(201, { guest: GUEST, token: "corto" });
    await assert.rejects(
      client().createGuest(INVITATION_ID, { name: "Ana", seats: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, "invalid-response");
        return true;
      },
    );

    answer(200, "texto");
    await assert.rejects(client().checkInGuest(INVITATION_ID, TOKEN), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});
