import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import { EmailSendError, type EmailMessage } from "../application/email-sender.port";
import { EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from "./http-email-request";
import { MailpitEmailSender } from "./mailpit-email-sender";
import { ResendEmailSender } from "./resend-email-sender";

// Local imitation of the provider APIs on an ephemeral port: the suite never reaches the network.

interface RecordedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

type Responder = (request: RecordedRequest, response: ServerResponse) => void;

interface FakeProvider {
  baseUrl: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

const openProviders: FakeProvider[] = [];

async function startFakeProvider(respond: Responder): Promise<FakeProvider> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const recorded: RecordedRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(recorded);
      respond(recorded, response);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const provider: FakeProvider = {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  openProviders.push(provider);
  return provider;
}

function json(status: number, body: unknown): Responder {
  return (_request, response) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
}

function slow(delayMs: number): Responder {
  return (_request, response) => {
    const timer = setTimeout(() => json(200, { id: "late" })(_request, response), delayMs);
    response.on("close", () => clearTimeout(timer));
  };
}

async function unusedPortUrl(): Promise<string> {
  const provider = await startFakeProvider(json(200, {}));
  await provider.close();
  openProviders.splice(openProviders.indexOf(provider), 1);
  return provider.baseUrl;
}

async function assertSendError(
  promise: Promise<unknown>,
  expected: { transient: boolean; reason: string; status?: number },
  forbidden: readonly string[] = [],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof EmailSendError);
    assert.equal(error.transient, expected.transient);
    assert.equal(error.reason, expected.reason);
    assert.equal(error.status, expected.status);
    const serialized = `${error.message} ${error.stack ?? ""} ${JSON.stringify(error)}`;
    for (const value of forbidden) {
      assert.equal(serialized.includes(value), false, `error leaked ${value}`);
    }
    return true;
  });
}

const MESSAGE: EmailMessage = {
  to: "guest.person@example.test",
  subject: "Tu código de acceso",
  text: "Código: 482913",
  html: "<p>Código: <strong>482913</strong></p>",
  idempotencyKey: "sign-in-code/verification-1",
};
/**
 * Short timeout for the slow-response tests only. Every other test keeps the production timeout, so a
 * cold first request under parallel test load cannot fail as a spurious timeout.
 */
const FAST_TIMEOUT_MS = 100;

afterEach(async () => {
  await Promise.all(openProviders.splice(0).map((provider) => provider.close()));
});

describe("ResendEmailSender", () => {
  // Generated per run: no provider key lives in source.
  const apiKey = `re_${randomBytes(16).toString("hex")}`;
  const from = "InvitaMe <no-reply@example.test>";

  function senderFor(
    provider: { baseUrl: string },
    timeoutMs = EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  ): ResendEmailSender {
    return new ResendEmailSender({ apiKey, from, baseUrl: provider.baseUrl, timeoutMs });
  }

  it("posts the documented request shape with Bearer auth and the Idempotency-Key header", async () => {
    const provider = await startFakeProvider(json(200, { id: "49a3999c" }));

    await senderFor(provider).send(MESSAGE);

    assert.equal(provider.requests.length, 1);
    const [request] = provider.requests;
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/emails");
    assert.equal(request.headers.authorization, `Bearer ${apiKey}`);
    assert.equal(request.headers["idempotency-key"], "sign-in-code/verification-1");
    assert.equal(request.headers["content-type"], "application/json");
    assert.equal(request.headers["user-agent"], "invitame-api/0.1.0");
    assert.deepEqual(JSON.parse(request.body), {
      from,
      to: ["guest.person@example.test"],
      subject: "Tu código de acceso",
      text: "Código: 482913",
      html: "<p>Código: <strong>482913</strong></p>",
    });
  });

  it("omits html when the message has only plain text", async () => {
    const provider = await startFakeProvider(json(200, { id: "1" }));
    const { html: _html, ...plainMessage } = MESSAGE;

    await senderFor(provider).send(plainMessage);

    assert.equal("html" in JSON.parse(provider.requests[0]?.body ?? "{}"), false);
  });

  it("defaults to the documented production endpoint", () => {
    assert.equal(new ResendEmailSender({ apiKey, from }).endpoint, "https://api.resend.com/emails");
  });

  it("maps 429 and 5xx to transient failures", async () => {
    const limited = await startFakeProvider(
      json(429, { statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests." }),
    );
    await assertSendError(senderFor(limited).send(MESSAGE), {
      transient: true,
      reason: "rate_limited",
      status: 429,
    });

    for (const status of [500, 503]) {
      const failing = await startFakeProvider(json(status, { name: "application_error" }));
      await assertSendError(senderFor(failing).send(MESSAGE), {
        transient: true,
        reason: "provider_unavailable",
        status,
      });
    }
  });

  it("maps other 4xx to permanent failures without echoing the provider body or the key", async () => {
    const provider = await startFakeProvider(
      json(400, {
        statusCode: 400,
        name: "validation_error",
        message: "Invalid `to` field: guest.person@example.test",
      }),
    );

    await assertSendError(
      senderFor(provider).send(MESSAGE),
      { transient: false, reason: "rejected", status: 400 },
      [apiKey, "guest.person@example.test", "482913", "validation_error"],
    );

    const unauthorized = await startFakeProvider(json(401, { name: "missing_api_key" }));
    await assertSendError(
      senderFor(unauthorized).send(MESSAGE),
      { transient: false, reason: "rejected", status: 401 },
      [apiKey],
    );
  });

  it("retries a request still in progress under the same key, but not a modified payload", async () => {
    const concurrent = await startFakeProvider(
      json(409, { statusCode: 409, name: "concurrent_idempotent_requests" }),
    );
    await assertSendError(senderFor(concurrent).send(MESSAGE), {
      transient: true,
      reason: "idempotent_request_in_progress",
      status: 409,
    });

    const modified = await startFakeProvider(
      json(409, { statusCode: 409, name: "invalid_idempotent_request" }),
    );
    await assertSendError(senderFor(modified).send(MESSAGE), {
      transient: false,
      reason: "rejected",
      status: 409,
    });
  });

  it("maps a slow response to a transient timeout", async () => {
    const provider = await startFakeProvider(slow(FAST_TIMEOUT_MS * 10));

    await assertSendError(senderFor(provider, FAST_TIMEOUT_MS).send(MESSAGE), {
      transient: true,
      reason: "timeout",
    });
  });

  it("maps a refused connection to a transient network failure without echoing the key", async () => {
    const baseUrl = await unusedPortUrl();

    await assertSendError(
      senderFor({ baseUrl }).send(MESSAGE),
      { transient: true, reason: "network" },
      [apiKey],
    );
  });
});

describe("MailpitEmailSender", () => {
  const localFrom = "InvitaMe Local <no-reply@invitame.localhost>";

  function senderFor(
    provider: { baseUrl: string },
    from = localFrom,
    timeoutMs = EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  ) {
    return new MailpitEmailSender({ baseUrl: provider.baseUrl, from, timeoutMs });
  }

  it("posts the documented send payload to /api/v1/send", async () => {
    const provider = await startFakeProvider(json(200, { ID: "iAfZVVe2UQfNSG5BAjgYwa" }));

    await senderFor(provider).send(MESSAGE);

    assert.equal(provider.requests.length, 1);
    const [request] = provider.requests;
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/v1/send");
    assert.equal(request.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(request.body), {
      From: { Name: "InvitaMe Local", Email: "no-reply@invitame.localhost" },
      To: [{ Email: "guest.person@example.test" }],
      Subject: "Tu código de acceso",
      Text: "Código: 482913",
      HTML: "<p>Código: <strong>482913</strong></p>",
      Headers: { "X-Idempotency-Key": "sign-in-code/verification-1" },
    });
  });

  it("accepts a bare sender address and omits HTML for a plain-text message", async () => {
    const provider = await startFakeProvider(json(200, { ID: "1" }));
    const { html: _html, ...plainMessage } = MESSAGE;

    await senderFor(provider, "dev@example.test").send(plainMessage);

    const payload = JSON.parse(provider.requests[0]?.body ?? "{}");
    assert.deepEqual(payload.From, { Email: "dev@example.test" });
    assert.equal("HTML" in payload, false);
  });

  it("maps 400 to permanent and 429 or 5xx to transient failures", async () => {
    const rejected = await startFakeProvider(json(400, { Error: "invalid To address" }));
    await assertSendError(
      senderFor(rejected).send(MESSAGE),
      { transient: false, reason: "rejected", status: 400 },
      ["invalid To address", "guest.person@example.test"],
    );

    const limited = await startFakeProvider(json(429, {}));
    await assertSendError(senderFor(limited).send(MESSAGE), {
      transient: true,
      reason: "rate_limited",
      status: 429,
    });

    const failing = await startFakeProvider(json(500, {}));
    await assertSendError(senderFor(failing).send(MESSAGE), {
      transient: true,
      reason: "provider_unavailable",
      status: 500,
    });
  });

  it("maps a slow response to a transient timeout and a refused connection to network", async () => {
    const provider = await startFakeProvider(slow(FAST_TIMEOUT_MS * 10));
    await assertSendError(senderFor(provider, localFrom, FAST_TIMEOUT_MS).send(MESSAGE), {
      transient: true,
      reason: "timeout",
    });

    const baseUrl = await unusedPortUrl();
    await assertSendError(senderFor({ baseUrl }).send(MESSAGE), {
      transient: true,
      reason: "network",
    });
  });
});
