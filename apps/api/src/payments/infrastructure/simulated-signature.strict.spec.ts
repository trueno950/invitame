import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SIMULATED_SIGNATURE_HEADER,
  signSimulatedWebhook,
  verifySimulatedSignature,
} from "./simulated-signature";

// Boundary and header-shape regressions of the simulated signature (M7 S4), from the independent verification (T3).

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-11-17T12:00:00Z");
const SECONDS = Math.floor(NOW.getTime() / 1000);
const BODY = '{"eventId":"evt-1","type":"paid"}';

function verify(header: unknown, rawBody = BODY): boolean {
  return verifySimulatedSignature({ secret: SECRET, rawBody, header, now: NOW });
}

function sign(timestamp: number): string {
  return signSimulatedWebhook({ secret: SECRET, rawBody: BODY, timestamp });
}

describe("simulated signature strictness (M7 S4)", () => {
  it("accepts exactly 300 seconds of skew and refuses 301 in both directions", () => {
    assert.equal(verify(sign(SECONDS - 300)), true);
    assert.equal(verify(sign(SECONDS - 301)), false);
    assert.equal(verify(sign(SECONDS + 300)), true);
    assert.equal(verify(sign(SECONDS + 301)), false);
    assert.equal(verify(sign(0)), false);
  });

  it("refuses every header shape the scheme does not state, and any changed body", () => {
    const good = sign(SECONDS);
    const digest = good.split("v1=")[1] ?? "";
    const refused: unknown[] = [
      undefined,
      "",
      [good],
      42,
      `t=${SECONDS}`,
      `v1=${digest}`,
      `${good},x=1`,
      `t=${SECONDS},${good}`,
      `t=${SECONDS},v1=${digest.toUpperCase()}`,
      `t=${SECONDS},v1=${digest.slice(0, 63)}`,
      `t=${SECONDS},v1=${digest}0`,
      `t=abc,v1=${digest}`,
      `t=,v1=${digest}`,
      `t=9999999999999,v1=${digest}`,
      `,${good}`,
      `t${SECONDS}${digest}`,
    ];

    for (const header of refused) {
      assert.equal(verify(header), false, JSON.stringify(header));
    }
    assert.equal(verify(good, `${BODY} `), false);
    assert.equal(verify(good, BODY.replace("paid", "failed")), false);
  });

  it("names the one header the adapter reads", () => {
    assert.equal(SIMULATED_SIGNATURE_HEADER, "x-invitame-signature");
  });
});
