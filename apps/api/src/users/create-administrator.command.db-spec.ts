import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "better-auth/crypto";
import { requireLocalDatabaseUrl } from "../../test/database";
import {
  INITIAL_PASSWORD_ALPHABET,
  INITIAL_PASSWORD_LENGTH,
  INITIAL_PASSWORD_NOTICE,
} from "./application/initial-password";

// The `admin:create` command (M2 T7, S20; T11, L66): its stdout layout, run as the package script
// runs it, against real PostgreSQL. The command reads `process.stdout.isTTY` and exports nothing, so a
// child process marks its piped stdout as a terminal before it loads the unchanged script. The use
// case and the repository are proved in their own suites; the TTY refusal is proved without the mark.

const API_ROOT = path.resolve(__dirname, "../..");
const COMMAND = "./src/users/create-administrator.command.ts";
// A synchronous spawn cannot be interrupted by node:test, so a child that hangs (on a database
// connection, say) would block the whole database suite. The bound turns a hang into a failure.
const CHILD_TIMEOUT_MS = 60_000;
// The alphabet holds only letters and digits, so it is safe inside a character class.
const PASSWORD_PATTERN = new RegExp(`^[${INITIAL_PASSWORD_ALPHABET}]{${INITIAL_PASSWORD_LENGTH}}$`);

describe("admin:create stdout (real PostgreSQL)", () => {
  const databaseUrl = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const email = `t11-admin-create-${randomUUID()}@example.test`;
  // Its own address, so the refusal test neither depends on the order of the tests nor can find an
  // account that the first test created.
  const refusedEmail = `t11-admin-create-refused-${randomUUID()}@example.test`;

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: [email, refusedEmail] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  /** Runs the command; the child must finish by itself within the bound, so a hang fails here. */
  function run(args: string[], terminal = true) {
    const load = [
      terminal ? "process.stdout.isTTY = true;" : "",
      `process.argv = ${JSON.stringify([process.execPath, COMMAND, ...args])};`,
      // `node -e` leaves `require.main` undefined, so the module's script guard does not fire: the
      // load calls its exported `main()`, the same entry the script runs.
      `require(${JSON.stringify(COMMAND)}).main();`,
    ].join(" ");
    const result = spawnSync(process.execPath, ["-r", "@swc-node/register", "-e", load], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    assert.equal(
      result.error,
      undefined,
      `the command did not run to its end: ${String(result.error)}`,
    );
    assert.equal(result.signal, null, `the command was stopped by ${result.signal}`);
    return result;
  }

  /** The stdout of a run that issued a password: one event line, the notice, the password. */
  async function assertIssued(stdout: string, event: Record<string, unknown>) {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    const [logged, notice, password = ""] = stdout.split("\n");
    assert.deepEqual(JSON.parse(logged ?? ""), { ...event, userId });
    assert.equal(notice, INITIAL_PASSWORD_NOTICE);
    assert.match(password, PASSWORD_PATTERN);
    assert.equal(stdout, `${logged}\n${INITIAL_PASSWORD_NOTICE}\n${password}\n`);
    assert.equal(stdout.includes(email), false, "the address is never printed");
    const { password: hash } = await prisma.account.findFirstOrThrow({
      where: { userId, providerId: "credential" },
    });
    assert.ok(hash && (await verifyPassword({ hash, password })), "the printed password is stored");
    return password;
  }

  it("prints the notice, a newline, the password, and a newline on create and on reissue", async () => {
    const created = run(["--", email]);
    assert.equal(created.status, 0, created.stderr);
    assert.equal(created.stderr, "");
    const first = await assertIssued(created.stdout, { event: "administrator_created" });

    const reissued = run(["--", email]);
    assert.equal(reissued.status, 0, reissued.stderr);
    assert.equal(reissued.stderr, "");
    const second = await assertIssued(reissued.stdout, {
      event: "administrator_password_reissued",
      revokedSessions: 0,
    });
    assert.notEqual(second, first);
  });

  it("exits 2 with nothing on stdout and no account when stdout is not a terminal", async () => {
    const piped = run(["--", refusedEmail], false);

    assert.equal(piped.status, 2);
    assert.equal(piped.stdout, "");
    assert.match(piped.stderr, /only on an interactive terminal/);
    assert.equal(await prisma.user.count({ where: { email: refusedEmail } }), 0);
  });
});
