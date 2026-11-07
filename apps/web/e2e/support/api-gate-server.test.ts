import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { GATE_READY_PATH } from "./api-gate.ts";
import { createApiGateServer } from "./api-gate-server.ts";

// The browser harness's API gate (M2 T9b part C2): an API answer that breaks off must end the web's
// request at once and leave the gate serving every later browser test
// (R3-gate-upstream-response-error-unhandled).

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("API gate server", () => {
  const api = createServer((request, response) => {
    if (request.url === "/broken") {
      // Promises 100 bytes, sends 7, then drops the connection.
      response.writeHead(200, { "content-length": "100" });
      response.write("partial", () => response.socket?.destroy());
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" }).end("ok");
  });
  let gate: Server;
  let gateOrigin: string;

  before(async () => {
    gate = createApiGateServer(await listen(api));
    gateOrigin = await listen(gate);
  });

  after(async () => {
    await Promise.all([close(gate), close(api)]);
  });

  it("forwards a request to the API unchanged", async () => {
    const response = await fetch(`${gateOrigin}/me`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
  });

  // Bounded: without the fix the web's request is left open, and the test must fail, not hang.
  it("breaks off the web's request when the API's answer breaks off, and keeps serving", {
    timeout: 5_000,
  }, async () => {
    await assert.rejects(async () => {
      const response = await fetch(`${gateOrigin}/broken`);
      await response.text();
    });

    assert.equal((await fetch(`${gateOrigin}${GATE_READY_PATH}`)).status, 204);
    assert.equal(await (await fetch(`${gateOrigin}/me`)).text(), "ok");
  });
});
