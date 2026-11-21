import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

// `next` has no package exports, so Node's own ESM resolver needs the file name that the bundler
// finds without one. This hook exists only in this test process (same reason as `proxy.test.ts`).
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context),
});
const { GET, dynamic } = await import("./route.ts");
const { config: proxyConfig } = await import("../../proxy.ts");

// The web's own liveness probe (M10 T3; S1, S5). It answers one constant and reads nothing, so it is
// the path `railway.web.json` checks after a deploy: it proves the Next.js server answers requests,
// not that the API or the database is reachable. `GET /health` on the API is the database-backed
// readiness probe.

/**
 * Next.js matches `proxy.ts` with its own path syntax: `:name` is one segment and `:name*` is zero or
 * more. This translates the subset the matcher uses, which is enough to answer whether a path is
 * proxied.
 */
function matcherMatches(pattern: string, path: string): boolean {
  const source = pattern
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? segment.endsWith("*")
          ? ".*"
          : "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}/?$`).test(path);
}

describe("GET /health of the web", () => {
  it("answers 200 with exactly the liveness body and nothing else", async () => {
    const response = GET();

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"status":"ok"}');
    assert.equal(response.headers.get("content-type"), "application/json");
  });

  it("is never cached, so every probe reaches the running server", async () => {
    const response = GET();

    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(dynamic, "force-dynamic");
  });

  it("takes no request, so it needs no session, no cookie, and no configuration", () => {
    assert.equal(GET.length, 0);
  });

  it("stays outside the session proxy and its refresh", () => {
    for (const pattern of proxyConfig.matcher) {
      assert.equal(matcherMatches(pattern, "/health"), false, `matcher ${pattern} proxies /health`);
    }
  });
});
