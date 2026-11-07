import { GATE_ORIGIN } from "./environment.ts";

/**
 * The API gate (R3-concurrent-cookie-isolation-not-forced): a harness-only pass-through between the
 * web server and the API (`api-gate-server.ts`). It forwards every request unchanged, except that a
 * test can ask it to hold the web's `GET /me` reads of a set of session cookies until each of them
 * has one read in flight, so the web process provably serves those renders at the same time. It is
 * not production code and never sees a request from the browser.
 */

/** Paths the web never requests from the API, so they cannot collide with a forwarded request. */
export const GATE_READY_PATH = "/__e2e/ready";
export const GATE_HOLD_PATH = "/__e2e/hold-account-reads";

/** A held group that is still incomplete after this long answers `504`, so the test fails. */
export const GATE_HOLD_TIMEOUT_MS = 10_000;

/** `released`: every read was in flight at once and was forwarded together; `timeout` otherwise. */
export type HoldOutcome = "released" | "timeout";

/**
 * Asks the gate to hold the next `GET /me` of each session cookie value until all of them have
 * arrived, then release them together. Call it before the page loads that read the account; it
 * resolves once the hold is armed, with the hold's eventual outcome.
 */
export async function holdAccountReads(
  sessionTokens: readonly string[],
): Promise<{ outcome: Promise<HoldOutcome> }> {
  const response = await fetch(new URL(GATE_HOLD_PATH, GATE_ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokens: sessionTokens }),
  });

  if (response.status !== 200) {
    throw new Error(`The API gate refused the hold with ${response.status}.`);
  }

  return { outcome: response.text() as Promise<HoldOutcome> };
}
