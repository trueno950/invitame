import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createMediaClient,
  isMediaUploadWithinBound,
  type MediaAsset,
  parseDeletedMedia,
  parseMediaAsset,
  parseMediaAssets,
  parseMediaLimits,
} from "./media-api.ts";

// The web server's client of the media API (M8 S2, S4): it forwards only Better Auth's cookies and the proxy secret,
// sends one upload as multipart built on the server (never the client's own MIME or filename), refuses an oversized
// file before sending anything with the bound the API's own read answered (M9 T13; S5, S8), and maps each documented
// refusal to a typed outcome instead of a body.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const ASSET_ID = "9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19";
const AT = "2026-11-20T12:00:00.000Z";

/** The asset every answer carries; its URL is the API's own origin, which is only known once the server listens. */
let ASSET: MediaAsset = {
  id: ASSET_ID,
  kind: "gallery",
  url: "",
  width: 1200,
  height: 800,
  alt: "Los novios en el jardín",
  position: 0,
  createdAt: AT,
};

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
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
      body: Buffer.concat(chunks),
    };
    received.push(entry);
    respond(entry, response);
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  apiOrigin = `http://127.0.0.1:${address.port}`;
  // The API answers `/media/<id>` on its own origin, which is the only host this client accepts (A5).
  ASSET = { ...ASSET, url: `${apiOrigin}/media/${ASSET_ID}` };
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
});

beforeEach(() => {
  received = [];
  respond = (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  };
});

/** The signed-in client of the run's own server; the origin is only known once it is listening. */
function client() {
  return createMediaClient(
    {
      config: {
        apiOrigin,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-test-ip",
        edgeClientIpHeader: "x-test-edge",
      },
    },
    async () => `theme=dark; ${SESSION_COOKIE}`,
  );
}

/** Answers JSON with one status and body. */
function answerJson(status: number, body: unknown): void {
  respond = (_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
}

/** Answers a refusal with its stable code and its issues. */
function answerRefusal(status: number, code: string, body: Record<string, unknown> = {}): void {
  answerJson(status, { code, message: "refused here", ...body });
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("media response parsers", () => {
  it("reads one asset of the documented shape", () => {
    assert.deepEqual(parseMediaAsset(ASSET, apiOrigin), ASSET);
    assert.deepEqual(
      parseMediaAssets(
        [ASSET, { ...ASSET, id: ID, kind: "main-photo", position: null }],
        apiOrigin,
      ),
      [ASSET, { ...ASSET, id: ID, kind: "main-photo", position: null }],
    );
  });

  it("refuses an asset that is not the documented shape", () => {
    for (const broken of [
      { ...ASSET, id: "not-a-uuid" },
      { ...ASSET, kind: "video" },
      { ...ASSET, url: "javascript:alert(1)" },
      { ...ASSET, url: "http://user:secret@localhost:3001/media/x" },
      { ...ASSET, url: "/media/relative" },
      { ...ASSET, width: 0 },
      { ...ASSET, height: 1.5 },
      { ...ASSET, alt: "x".repeat(121) },
      { ...ASSET, position: -1 },
      { ...ASSET, createdAt: "yesterday" },
      { ...ASSET, width: undefined },
    ]) {
      assert.equal(parseMediaAsset(broken, apiOrigin), undefined);
    }
    assert.equal(parseMediaAssets({}, apiOrigin), undefined);
    assert.equal(parseMediaAssets([ASSET, { id: ID }], apiOrigin), undefined);
  });

  it("refuses an asset URL on any host but the API origin", () => {
    // Defence in depth (A5): the API builds `<origin>/media/<id>` from its own public base URL, so a body that names
    // another host — a third party, a tracker, a provider bucket — is not this contract and is refused whole.
    for (const url of [
      `https://evil.example/media/${ASSET_ID}`,
      `http://localhost:3001/media/${ASSET_ID}`,
      `http://127.0.0.1:1/media/${ASSET_ID}`,
      `${apiOrigin}.evil.example/media/${ASSET_ID}`,
      `${apiOrigin}/media/${ASSET_ID}`.replace("http://", "https://"),
    ]) {
      assert.equal(parseMediaAsset({ ...ASSET, url }, apiOrigin), undefined, url);
      assert.equal(parseMediaAssets([{ ...ASSET, url }], apiOrigin), undefined, url);
    }

    // The same path on the configured origin is accepted, so only the host is the rule.
    assert.deepEqual(
      parseMediaAsset({ ...ASSET, url: `${apiOrigin}/media/${ASSET_ID}` }, apiOrigin),
      ASSET,
    );
  });

  it("reads the answer of a removal", () => {
    assert.deepEqual(parseDeletedMedia({ status: "deleted" }), { status: "deleted" });
    assert.equal(parseDeletedMedia({ status: "stored" }), undefined);
    assert.equal(parseDeletedMedia(undefined), undefined);
  });

  it("reads the limits the API answers, and refuses any other shape", () => {
    assert.deepEqual(parseMediaLimits({ maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: 6 }), {
      maxUploadBytes: 15 * 1024 * 1024,
      galleryPhotoLimit: 6,
    });
    for (const broken of [
      {},
      { maxUploadBytes: 0, galleryPhotoLimit: 6 },
      { maxUploadBytes: -1, galleryPhotoLimit: 6 },
      { maxUploadBytes: 1.5, galleryPhotoLimit: 6 },
      { maxUploadBytes: "10", galleryPhotoLimit: 6 },
      { maxUploadBytes: null, galleryPhotoLimit: 6 },
      // A body without the configured gallery cap is not this contract: the page then states no cap and invents none.
      { maxUploadBytes: 15 * 1024 * 1024 },
      { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: 0 },
      { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: -1 },
      { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: 1.5 },
      { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: "12" },
      { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: null },
      { jobs: 1 },
      [],
      null,
      undefined,
    ]) {
      assert.equal(parseMediaLimits(broken), undefined, JSON.stringify(broken));
    }
  });

  it("measures one file against the bound it was given, and refuses a size that is not a positive count", () => {
    assert.equal(isMediaUploadWithinBound(1, 10), true);
    assert.equal(isMediaUploadWithinBound(10, 10), true);
    assert.equal(isMediaUploadWithinBound(11, 10), false);
    for (const size of [0, -1, 1.5, Number.NaN, "10", null, undefined]) {
      assert.equal(isMediaUploadWithinBound(size, 10), false, String(size));
    }
  });
});

describe("media upload", () => {
  it("forwards one file as multipart with the session cookie and the proxy secret", async () => {
    answerJson(201, ASSET);
    const file = bytes(0xff, 0xd8, 0xff, 0x00, 0x10, 0x20);

    const result = await client().upload(ID, { bytes: file, kind: "gallery", alt: "Los novios" });

    assert.deepEqual(result, { ok: true, value: ASSET });
    const request = received[0];
    assert.ok(request);
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, `/invitations/${ID}/media`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.match(String(request?.headers["content-type"]), /^multipart\/form-data; boundary=/);

    const body = request?.body.toString("latin1") ?? "";
    assert.match(body, /name="kind"\r\n\r\ngallery/);
    assert.match(body, /name="alt"\r\n\r\nLos novios/);
    assert.match(body, /name="file"/);
    // The bytes travel untouched, and the server names the part itself: no client MIME and no original filename.
    assert.ok(request?.body.includes(Buffer.from(file)));
    assert.match(body, /content-type: application\/octet-stream/i);
    assert.match(body, /filename="photo"/);
    assert.doesNotMatch(body, /image\/jpeg/i);
    assert.doesNotMatch(body, /vacaciones/);
  });

  it("sends no alt field when the creator left it empty", async () => {
    answerJson(201, { ...ASSET, alt: null });

    await client().upload(ID, {
      bytes: bytes(0x89, 0x50, 0x4e, 0x47),
      kind: "main-photo",
      alt: null,
    });

    assert.doesNotMatch(received[0]?.body.toString("latin1") ?? "", /name="alt"/);
  });

  it("refuses a file over the bound the API answered before sending anything", async () => {
    const maxBytes = 15 * 1024 * 1024;
    const oversized = new Uint8Array(maxBytes + 1);

    const result = await client().upload(ID, {
      bytes: oversized,
      kind: "gallery",
      alt: null,
      maxBytes,
    });

    assert.deepEqual(result, { ok: false, failure: "payload-too-large" });
    assert.equal(received.length, 0);
  });

  it("accepts a file of exactly the bound, and a file of a raised bound the panel saved", async () => {
    const maxBytes = 15 * 1024 * 1024;
    answerJson(201, ASSET);

    const result = await client().upload(ID, {
      bytes: new Uint8Array(maxBytes),
      kind: "gallery",
      alt: null,
      maxBytes,
    });

    assert.equal(result.ok, true);
    assert.equal(received.length, 1);
  });

  it("sends a file of any size when no bound was answered, leaving the API to refuse it", async () => {
    // The bound is the API's: when the limits read failed, nothing is refused here and the API's own 413 or 400 decides
    // (M9 T13; S5, S8). Never a number this server invented.
    answerJson(201, ASSET);

    const result = await client().upload(ID, {
      bytes: new Uint8Array(64 * 1024 * 1024),
      kind: "gallery",
      alt: null,
    });

    assert.equal(result.ok, true);
    assert.equal(received.length, 1);
  });

  it("maps every documented upload refusal and never keeps the body", async () => {
    const cases: Array<[number, string, string]> = [
      [400, "INVALID_MEDIA_UPLOAD", "invalid-upload"],
      [404, "MEDIA_NOT_FOUND", "not-found"],
      [409, "INVITATION_NOT_EDITABLE", "not-editable"],
      [409, "GALLERY_NOT_AVAILABLE", "gallery-unavailable"],
      [409, "MEDIA_LIMIT_REACHED", "limit-reached"],
      [413, "PAYLOAD_TOO_LARGE", "payload-too-large"],
      [415, "UNSUPPORTED_MEDIA_TYPE", "unsupported-media-type"],
      [503, "MEDIA_STORAGE_UNAVAILABLE", "storage-unavailable"],
    ];

    for (const [status, code, failure] of cases) {
      answerRefusal(status, code);
      const result = await client().upload(ID, {
        bytes: bytes(0xff, 0xd8, 0xff),
        kind: "main-photo",
        alt: null,
      });
      assert.deepEqual(result, { ok: false, failure }, `${status} ${code}`);
    }
  });

  it("answers signed-out without sending when there is no session cookie", async () => {
    const anonymous = createMediaClient(
      {
        config: {
          apiOrigin,
          proxySecret: PROXY_SECRET,
          clientIpHeader: "x",
          edgeClientIpHeader: "x",
        },
      },
      async () => "theme=dark",
    );

    const result = await anonymous.upload(ID, { bytes: bytes(0xff), kind: "gallery", alt: null });

    assert.deepEqual(result, { ok: false, failure: "signed-out" });
    assert.equal(received.length, 0);
  });

  it("fails closed on a success body that breaks the contract", async () => {
    answerJson(201, { ...ASSET, width: "wide" });

    await assert.rejects(
      () => client().upload(ID, { bytes: bytes(0xff), kind: "gallery", alt: null }),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });

  it("fails closed when an answered image URL is not on the API origin", async () => {
    // The editor renders this URL as an `<img src>`; a body that points somewhere else is refused before it can
    // reach a page (A5).
    answerJson(201, { ...ASSET, url: `https://evil.example/media/${ASSET_ID}` });

    await assert.rejects(
      () => client().upload(ID, { bytes: bytes(0xff), kind: "gallery", alt: null }),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });

  it("fails closed on a 500 that is not a documented refusal", async () => {
    answerJson(500, { code: "SOMETHING_ELSE" });

    await assert.rejects(
      () => client().upload(ID, { bytes: bytes(0xff), kind: "gallery", alt: null }),
      (error: unknown) => error instanceof ApiClientError && error.kind === "unavailable",
    );
  });
});

describe("media list, update, and removal", () => {
  it("reads the owner's assets", async () => {
    answerJson(200, [ASSET]);

    assert.deepEqual(await client().list(ID), { ok: true, value: [ASSET] });
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/invitations/${ID}/media`);
  });

  it("reads the limits of one invitation from its own route", async () => {
    answerJson(200, { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: 6 });

    assert.deepEqual(await client().limits(ID), {
      ok: true,
      value: { maxUploadBytes: 15 * 1024 * 1024, galleryPhotoLimit: 6 },
    });
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, `/invitations/${ID}/media/limits`);
    assert.equal(received[0]?.headers.cookie, SESSION_COOKIE);
  });

  it("maps a refused limits read and sends nothing for an id that is not a UUID", async () => {
    answerRefusal(404, "MEDIA_NOT_FOUND");
    assert.deepEqual(await client().limits(ID), { ok: false, failure: "not-found" });

    received = [];
    assert.deepEqual(await client().limits("../secret"), { ok: false, failure: "not-found" });
    assert.equal(received.length, 0);
  });

  it("sends only the fields of one edit", async () => {
    answerJson(200, { ...ASSET, alt: "Nuevo texto" });

    await client().update(ID, ASSET_ID, { alt: "Nuevo texto" });
    await client().update(ID, ASSET_ID, { position: 2 });

    assert.equal(received[0]?.method, "PATCH");
    assert.equal(received[0]?.url, `/invitations/${ID}/media/${ASSET_ID}`);
    assert.deepEqual(JSON.parse(received[0]?.body.toString("utf8") ?? "{}"), {
      alt: "Nuevo texto",
    });
    assert.deepEqual(JSON.parse(received[1]?.body.toString("utf8") ?? "{}"), { position: 2 });
  });

  it("refuses an edit with nothing to change before sending anything", async () => {
    assert.deepEqual(await client().update(ID, ASSET_ID, {}), {
      ok: false,
      failure: "invalid-update",
    });
    assert.equal(received.length, 0);
  });

  it("maps the documented edit and removal refusals", async () => {
    answerRefusal(400, "INVALID_MEDIA_UPDATE");
    assert.deepEqual(await client().update(ID, ASSET_ID, { position: -3 }), {
      ok: false,
      failure: "invalid-update",
    });

    answerJson(200, { status: "deleted" });
    assert.deepEqual(await client().remove(ID, ASSET_ID), {
      ok: true,
      value: { status: "deleted" },
    });
    assert.equal(received.at(-1)?.method, "DELETE");
    assert.equal(received.at(-1)?.url, `/invitations/${ID}/media/${ASSET_ID}`);

    answerRefusal(404, "MEDIA_NOT_FOUND");
    assert.deepEqual(await client().remove(ID, ASSET_ID), { ok: false, failure: "not-found" });
  });

  it("sends nothing when an id is not a UUID", async () => {
    assert.deepEqual(await client().list("../secret"), { ok: false, failure: "not-found" });
    assert.deepEqual(await client().update(ID, "not-a-uuid", { alt: null }), {
      ok: false,
      failure: "not-found",
    });
    assert.equal(received.length, 0);
  });
});
