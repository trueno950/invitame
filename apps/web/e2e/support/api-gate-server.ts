import {
  createServer,
  type IncomingMessage,
  request,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  GATE_HOLD_PATH,
  GATE_HOLD_TIMEOUT_MS,
  GATE_READY_PATH,
  type HoldOutcome,
} from "./api-gate.ts";

/**
 * The API gate's server (see `api-gate.ts`), which `api-gate-main.ts` starts as a harness process.
 * Every request is forwarded to the API as received; only the `GET /me` reads named by a hold wait.
 * One gate per process: `createApiGateServer` sets the API it forwards to.
 */

interface HeldRead {
  incoming: IncomingMessage;
  outgoing: ServerResponse;
}

interface HeldGroup {
  /** Session cookie value to its held read, once that read has arrived. */
  arrivals: Map<string, HeldRead>;
  tokens: readonly string[];
  /** The hold request, answered with the group's outcome. */
  armer: ServerResponse;
  timer: NodeJS.Timeout;
}

const groups = new Set<HeldGroup>();
let apiOrigin = "";

function forward(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const upstream = request(
    new URL(incoming.url ?? "/", apiOrigin),
    { method: incoming.method, headers: { ...incoming.headers, host: new URL(apiOrigin).host } },
    (answer) => {
      // An answer that breaks off ends the web's request too; unhandled, the web's request stayed
      // open until its own timeout (R3-gate-upstream-response-error-unhandled).
      answer.on("error", () => outgoing.destroy());
      outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(outgoing);
    },
  );
  upstream.on("error", () => {
    if (outgoing.headersSent) {
      outgoing.destroy();
      return;
    }
    outgoing.writeHead(502).end();
  });
  incoming.on("error", () => upstream.destroy());
  incoming.pipe(upstream);
}

function settle(group: HeldGroup, outcome: HoldOutcome): void {
  clearTimeout(group.timer);
  groups.delete(group);
  group.armer.end(outcome);
}

function arm(incoming: IncomingMessage, outgoing: ServerResponse): void {
  let body = "";
  incoming.setEncoding("utf8");
  incoming.on("data", (chunk: string) => {
    body += chunk;
  });
  incoming.on("end", () => {
    let tokens: unknown;
    try {
      tokens = (JSON.parse(body) as { tokens?: unknown }).tokens;
    } catch {
      tokens = undefined;
    }
    if (
      !Array.isArray(tokens) ||
      tokens.length < 2 ||
      !tokens.every((token) => typeof token === "string" && token.length > 0)
    ) {
      outgoing.writeHead(400).end();
      return;
    }

    const group: HeldGroup = {
      arrivals: new Map(),
      tokens,
      armer: outgoing,
      timer: setTimeout(() => {
        // Fail closed: an incomplete group never passes as concurrent reads.
        settle(group, "timeout");
        for (const { outgoing: held } of group.arrivals.values()) {
          held.writeHead(504).end();
        }
      }, GATE_HOLD_TIMEOUT_MS),
    };
    groups.add(group);
    // The headers say "armed"; the body, sent when the group settles, is its outcome.
    outgoing.writeHead(200, { "content-type": "text/plain" });
    outgoing.flushHeaders();
  });
}

/** Holds a `GET /me` whose cookie names a token of an armed group; `false` when none matches. */
function hold(incoming: IncomingMessage, outgoing: ServerResponse): boolean {
  const cookie = incoming.headers.cookie ?? "";

  for (const group of groups) {
    const token = group.tokens.find(
      (value) => cookie.includes(value) && !group.arrivals.has(value),
    );
    if (token === undefined) {
      continue;
    }

    group.arrivals.set(token, { incoming, outgoing });
    if (group.arrivals.size === group.tokens.length) {
      // Every read is in flight: forward all of them together.
      settle(group, "released");
      for (const read of group.arrivals.values()) {
        forward(read.incoming, read.outgoing);
      }
    }
    return true;
  }

  return false;
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const path = new URL(incoming.url ?? "/", apiOrigin).pathname;

  if (path === GATE_READY_PATH) {
    outgoing.writeHead(204).end();
    return;
  }
  if (path === GATE_HOLD_PATH && incoming.method === "POST") {
    arm(incoming, outgoing);
    return;
  }
  if (path === "/me" && incoming.method === "GET" && hold(incoming, outgoing)) {
    return;
  }
  forward(incoming, outgoing);
}

/** A gate in front of the API at `origin`; the caller decides where it listens. */
export function createApiGateServer(origin: string): Server {
  apiOrigin = origin;
  return createServer(handle);
}
