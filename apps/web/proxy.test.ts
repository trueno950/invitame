import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { registerHooks } from "node:module";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { API_UNAVAILABLE_HEADER } from "./lib/server/session-refresh.ts";

// `next` has no package exports, so Node's own ESM resolver needs the file name that the bundler
// finds without one. This hook exists only in this test process.
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context),
});
const { NextRequest } = await import("next/server");
const { proxy } = await import("./proxy.ts");

// The page proxy (M2 T8c, T9b part C1; L34, L59). Before a session page renders, it strips the
// browser's own copy of the outage header and sets it only when its own session refresh found the
// API failing (R3-outage-header-wiring-unproved). Next.js hands the page the request headers that
// `NextResponse.next({ request })` names in `x-middleware-override-headers`, each as
// `x-middleware-request-<name>`.

const FORWARDED = `x-middleware-request-${API_UNAVAILABLE_HEADER}`;
const SESSION_COOKIE = "better-auth.session_token=token.signature";

let apiStatus = 200;
const api: Server = createServer((_request, response) => {
  response.writeHead(apiStatus, { "content-type": "application/json" }).end("null");
});

before(async () => {
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  // Read once, on the proxy's first use: the API this test controls.
  process.env.API_ORIGIN = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

after(async () => {
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
});

function pageRequest(path: string, headers: Record<string, string>) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, { headers });
}

/** The outage header the page's render receives, or `null` when the proxy removed it. */
async function headerForPage(request: InstanceType<typeof NextRequest>): Promise<string | null> {
  const response = await proxy(request);
  const overridden = response.headers.get("x-middleware-override-headers")?.split(",") ?? [];
  assert.ok(overridden.length > 0, "the proxy sets the page's request headers");
  return overridden.includes(API_UNAVAILABLE_HEADER) ? response.headers.get(FORWARDED) : null;
}

describe("proxy and the outage notice for the page", () => {
  it("strips a browser's own outage header when the refresh succeeds", async () => {
    apiStatus = 200;
    const forged = { cookie: SESSION_COOKIE, [API_UNAVAILABLE_HEADER]: "1" };
    assert.equal(await headerForPage(pageRequest("/cuenta", forged)), null);
  });

  it("strips it without a session cookie, where no refresh runs", async () => {
    assert.equal(
      await headerForPage(pageRequest("/cuenta", { [API_UNAVAILABLE_HEADER]: "1" })),
      null,
    );
  });

  it("sets it only from its own refresh that the API failed, whatever the browser sent", async () => {
    apiStatus = 503;
    for (const sent of ["0", "", "1"]) {
      const headers = { cookie: SESSION_COOKIE, [API_UNAVAILABLE_HEADER]: sent };
      assert.equal(await headerForPage(pageRequest("/cuenta", headers)), "1", `sent "${sent}"`);
    }
    assert.equal(await headerForPage(pageRequest("/ingresar", { cookie: SESSION_COOKIE })), "1");
  });

  it("refreshes the session of the co-host's acceptance before it renders (F12; L17.3)", async () => {
    // The acceptance reads the session to decide whether the visitor signs in first, so the proxy that refreshes every
    // session page runs here too: the outage header proves the refresh happened instead of being skipped.
    apiStatus = 503;
    assert.equal(
      await headerForPage(
        pageRequest("/colaboraciones/aceptar?token=aaaaaaaaaaaaaaaaaaaaaa", {
          cookie: SESSION_COOKIE,
        }),
      ),
      "1",
    );

    apiStatus = 200;
    assert.equal(
      await headerForPage(pageRequest("/colaboraciones/aceptar", { cookie: SESSION_COOKIE })),
      null,
    );
    // An anonymous visitor never reaches the API through the proxy, and the page sends them through sign-in itself.
    assert.equal(await headerForPage(pageRequest("/colaboraciones/aceptar", {})), null);
  });
});
