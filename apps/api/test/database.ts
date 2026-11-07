import assert from "node:assert/strict";
import { randomInt } from "node:crypto";

// Shared harness for the `*.db-spec.ts` suites (M2 T9a). They run through
// `pnpm --filter @invitame/api test:db` locally and in the CI `database-tests` job, always against a
// disposable, already migrated PostgreSQL that the runner names in DATABASE_URL.

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The explicit DATABASE_URL of a local database. Fails closed: every suite writes and deletes rows,
 * so none runs without an explicit URL or against a remote host.
 */
export function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

/**
 * Where a suite draws its client addresses from, inside the benchmarking range (RFC 2544,
 * 198.18.0.0/15):
 * - `shared`: 198.18.0.0/16, for suites that use a fresh address per request and never count rows;
 * - a counting suite's own name: one block of 64 third octets in 198.19.0.0/16, for a suite that
 *   asserts exact `RateLimit` counts on one address (R3-counted-range-shared-by-three-suites). Suites
 *   run in parallel processes, so two counting suites drawing from one block could pick the same
 *   address; each block belongs to exactly one suite, named here, and no other suite draws from it.
 */
const COUNTED_BLOCKS = {
  "auth.prisma": 0,
  "abuse-limits.prisma": 64,
  "auth-proxy-secret.prisma": 128,
} as const satisfies Record<string, number>;
const COUNTED_BLOCK_SIZE = 64;

export type CountingSuite = keyof typeof COUNTED_BLOCKS;
export type ClientAddressRange = "shared" | CountingSuite;

function drawAddress(range: ClientAddressRange): string {
  const host = randomInt(1, 255);
  if (range === "shared") {
    return `198.18.${randomInt(0, 256)}.${host}`;
  }
  const first = COUNTED_BLOCKS[range];
  return `198.19.${randomInt(first, first + COUNTED_BLOCK_SIZE)}.${host}`;
}

/**
 * Client IP addresses for one suite (L17, L25, L37 R3-db-spec-client-prefix-collision). Node runs
 * the database suites in parallel processes against one database, and Better Auth keys rate limits
 * by `<client IP>|<path>`. A fixed or per-run /24 prefix let two suites share addresses, and with
 * them rate-limit buckets and cleanup. Each address here is drawn at random from its range (65,024
 * shared or 16,256 counted host addresses), never repeats within the suite, and is recorded, so
 * cleanup removes exactly the rows this suite created.
 */
export class ClientAddresses {
  private readonly issued = new Set<string>();

  constructor(private readonly range: ClientAddressRange = "shared") {}

  /** A new address that this suite has not used yet. */
  next(): string {
    for (;;) {
      const address = drawAddress(this.range);
      if (!this.issued.has(address)) {
        this.issued.add(address);
        return address;
      }
    }
  }

  /** A Prisma `where` for the `RateLimit` rows of every issued address; matches nothing if none. */
  rateLimitRows(): { OR: Array<{ key: { startsWith: string } }> } {
    return { OR: [...this.issued].map((address) => ({ key: { startsWith: `${address}|` } })) };
  }
}
