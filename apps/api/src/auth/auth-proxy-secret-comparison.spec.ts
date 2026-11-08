import assert from "node:assert/strict";
import crypto, { randomBytes } from "node:crypto";
import { describe, it, mock } from "node:test";

import { AUTH_PROXY_SECRET_HEADER, guardAuthHandler } from "./auth-request-guard";

// S47 (L71): while a rotation lasts, the guard compares the presented value with every configured
// secret, whichever one matches, so the response time does not tell which secret the web still uses.

const CLIENT_IP_HEADER = "x-invitame-client-ip";

describe("the proxy secret comparison during a rotation (S47, L71)", () => {
  it("runs one constant-time comparison per configured secret, whichever matches or none does", async () => {
    const current = randomBytes(32).toString("base64url");
    const previous = randomBytes(32).toString("base64url");
    const guarded = guardAuthHandler(async () => Response.json({ ok: true }), {
      log: () => {},
      proxy: {
        secret: current,
        previousSecret: previous,
        required: true,
        clientIpHeader: CLIENT_IP_HEADER,
      },
    });
    const compare = mock.method(crypto, "timingSafeEqual");

    try {
      const calls: Record<string, number> = {};
      const statuses: Record<string, number> = {};
      for (const [label, value] of [
        ["current", current],
        ["previous", previous],
        ["wrong", randomBytes(32).toString("base64url")],
      ] as const) {
        compare.mock.resetCalls();
        const response = await guarded(
          new Request("http://localhost:3000/api/auth/ok", {
            headers: { [AUTH_PROXY_SECRET_HEADER]: value },
          }),
        );
        calls[label] = compare.mock.callCount();
        statuses[label] = response.status;
      }

      assert.deepEqual(calls, { current: 2, previous: 2, wrong: 2 });
      assert.deepEqual(statuses, { current: 200, previous: 200, wrong: 403 });
    } finally {
      compare.mock.restore();
    }
  });
});
