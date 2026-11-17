import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  SIMULATED_SIGNATURE_HEADER,
  SIMULATED_SIGNATURE_TOLERANCE_SECONDS,
  signSimulatedWebhook,
  verifySimulatedSignature,
} from "./simulated-signature";

// The simulated provider's signature scheme (M7 S4): `x-invitame-signature: t=<unix>,v1=<hex>` where the hex is
// HMAC-SHA256 over `<unix>.<raw body>` with the development secret. Verification is constant-time
// (`crypto.timingSafeEqual`) and bounded in time: an event whose timestamp is more than five minutes away from the
// API's clock is stale, and a stale event is refused exactly like a forged one. Nothing here logs or echoes the
// secret, the header, the body, or the expected signature.

const SECRET = "local-simulated-payments-secret-of-32-chars";
const OTHER_SECRET = "another-local-simulated-secret-of-32-chars";
const NOW = new Date("2026-11-21T12:00:00.000Z");
const AT = Math.floor(NOW.getTime() / 1000);
const BODY = '{"eventId":"sim-1","type":"paid"}';

function sign(body: string, at: number, secret: string = SECRET): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
}

function verify(
  overrides: { secret?: string; rawBody?: string; header?: unknown; now?: Date } = {},
): boolean {
  return verifySimulatedSignature({
    secret: overrides.secret ?? SECRET,
    rawBody: overrides.rawBody ?? BODY,
    // `in` and not `??`: a test asks for a *missing* header by passing `undefined` on purpose.
    header: "header" in overrides ? overrides.header : sign(BODY, AT),
    now: overrides.now ?? NOW,
  });
}

describe("simulated webhook signature (S4)", () => {
  it("names the header and the five-minute tolerance the adapter documents", () => {
    assert.equal(SIMULATED_SIGNATURE_HEADER, "x-invitame-signature");
    assert.equal(SIMULATED_SIGNATURE_TOLERANCE_SECONDS, 300);
  });

  it("accepts a body signed with the configured secret at the current instant", () => {
    assert.equal(verify(), true);
    assert.equal(
      signSimulatedWebhook({ secret: SECRET, rawBody: BODY, timestamp: AT }),
      sign(BODY, AT),
    );
  });

  it("accepts a timestamp exactly at the tolerance boundary in both directions", () => {
    const boundary = SIMULATED_SIGNATURE_TOLERANCE_SECONDS;

    assert.equal(verify({ header: sign(BODY, AT - boundary) }), true);
    assert.equal(verify({ header: sign(BODY, AT + boundary) }), true);
  });

  it("refuses a missing or non-string header", () => {
    for (const header of [undefined, null, "", 42, ["t=1,v1=00"], {}]) {
      assert.equal(verify({ header }), false, JSON.stringify(header ?? null));
    }
  });

  it("refuses a signature made with another secret", () => {
    assert.equal(verify({ header: sign(BODY, AT, OTHER_SECRET) }), false);
  });

  it("refuses a tampered body", () => {
    assert.equal(verify({ rawBody: `${BODY} ` }), false);
    assert.equal(verify({ rawBody: BODY.replace("paid", "refunded") }), false);
  });

  it("refuses a stale timestamp older than the tolerance", () => {
    assert.equal(
      verify({ header: sign(BODY, AT - SIMULATED_SIGNATURE_TOLERANCE_SECONDS - 1) }),
      false,
    );
  });

  it("refuses a timestamp in the future beyond the tolerance", () => {
    assert.equal(
      verify({ header: sign(BODY, AT + SIMULATED_SIGNATURE_TOLERANCE_SECONDS + 1) }),
      false,
    );
  });

  it("refuses a malformed header without throwing", () => {
    const valid = sign(BODY, AT);
    const [, hex = ""] = valid.split("v1=");
    const malformed = [
      `v1=${hex}`,
      `t=${AT}`,
      `t=${AT},v1=`,
      `t=not-a-number,v1=${hex}`,
      `t=-1,v1=${hex}`,
      `t=1.5,v1=${hex}`,
      `t=${AT},v1=${hex.slice(0, -2)}`,
      `t=${AT},v1=${hex.toUpperCase()}`,
      `t=${AT},v1=${hex}zz`,
      `t=${AT},v1=${hex},v1=${hex}`,
      `t=${AT},t=${AT},v1=${hex}`,
      `t=${AT},v1=${hex},unknown=1`,
      `t=${AT};v1=${hex}`,
      ` ${valid} `,
    ];

    for (const header of malformed) {
      assert.equal(verify({ header }), false, header);
    }
  });
});
