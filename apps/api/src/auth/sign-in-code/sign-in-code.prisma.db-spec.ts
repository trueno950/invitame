import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../../test/database";
import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import type { EmailMessage, EmailSender } from "../../email/application/email-sender.port";
import { emailCodeQuotaKey } from "../abuse-limits";
import { createAuth } from "../auth.factory";
import { BackgroundTasks } from "./background-tasks";
import { SignInCodeSender } from "./sign-in-code-sender";

// The production `createAuth` sign-in code flow on the Prisma adapter (M2 T5a). Runs only through
// `pnpm --filter @invitame/api test:db` (locally and in the CI `database-tests` job) with an explicit
// DATABASE_URL that points at a disposable, already migrated local database; not part of `pnpm test`.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";
const CODE_PATTERN = /\b(\d{6})\b/;
const CODE_LIFETIME_MS = 300_000;
const HOUR_MS = 60 * 60 * 1000;

/** Delivers at once unless the next send is held; a held send fails when released. */
class HoldingEmailSender implements EmailSender {
  readonly attempts: EmailMessage[] = [];
  readonly delivered: EmailMessage[] = [];
  private held: Promise<void> | undefined;

  holdNextAndFail(): () => void {
    let release!: () => void;
    this.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  async send(message: EmailMessage): Promise<void> {
    this.attempts.push(message);
    const held = this.held;
    this.held = undefined;

    if (held) {
      await held;
      throw new Error("held delivery failed");
    }

    this.delivered.push(message);
  }
}

async function snapshot(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    setCookie: response.headers.getSetCookie(),
  };
}

function codeFrom(message: EmailMessage | undefined): string {
  const code = message ? CODE_PATTERN.exec(message.text)?.[1] : undefined;
  assert.ok(code, "the message carries a 6-digit code");
  return code;
}

describe("sign-in codes through createAuth on the Prisma schema (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const sender = new HoldingEmailSender();
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  const runId = randomUUID();
  const emails: string[] = [];
  const clientAddresses = new ClientAddresses();

  function newEmail(label: string): string {
    const email = `t5a-${label}-${runId}@example.test`;
    emails.push(email);
    return email;
  }

  function post(path: string, body: unknown): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          // A fresh client IP per request keeps the per-IP limit out of these flows.
          "x-forwarded-for": clientAddresses.next(),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function requestCode(email: string): Promise<Response> {
    return post("/email-otp/send-verification-otp", { email, type: "sign-in" });
  }

  function verificationRows(email: string) {
    return prisma.verification.findMany({ where: { identifier: `sign-in-otp-${email}` } });
  }

  after(async () => {
    try {
      await tasks.drain();
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.verification.deleteMany({
        where: { identifier: { in: emails.map((email) => `sign-in-otp-${email}`) } },
      });
      await prisma.rateLimit.deleteMany({
        where: {
          OR: [
            { key: { in: emails.map(emailCodeQuotaKey) } },
            ...clientAddresses.rateLimitRows().OR,
          ],
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("stores the code hashed and ignores client name and image when the code creates a customer", async () => {
    const email = newEmail("customer");

    assert.equal((await requestCode(email)).status, 200);
    await tasks.drain();
    const code = codeFrom(sender.delivered.at(-1));

    const [row] = await verificationRows(email);
    assert.ok(row);
    assert.equal(row.value, `${createHash("sha256").update(code).digest("base64url")}:0`);

    const response = await post("/sign-in/email-otp", {
      email,
      otp: code,
      name: "x".repeat(10_000),
      image: "https://tracker.example.test/pixel.png",
      role: "ADMIN",
    });
    assert.equal(response.status, 200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.displayName, "");
    assert.equal(user.image, null);
    assert.equal(user.role, "CUSTOMER");
  });

  it("invalidates only a code whose delivery failed, keeping a newer code valid", async () => {
    const email = newEmail("failed");
    const releaseFailure = sender.holdNextAndFail();

    await requestCode(email);
    await requestCode(email);
    while (sender.delivered.every((message) => message.to !== email)) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal((await verificationRows(email)).length, 2);

    releaseFailure();
    await tasks.drain();

    const failedCode = codeFrom(sender.attempts.find((message) => message.to === email));
    const newerCode = codeFrom(sender.delivered.find((message) => message.to === email));
    assert.equal((await verificationRows(email)).length, 1);

    const rejected = await post("/sign-in/email-otp", { email, otp: failedCode });
    assert.equal(rejected.status, 400);
    // The wrong guess counted against the newer code; the newer code itself still signs in.
    const accepted = await post("/sign-in/email-otp", { email, otp: newerCode });
    assert.equal(accepted.status, 200);
  });

  it("sends an administrator no code and removes the issued row", async () => {
    const email = newEmail("admin");
    await prisma.user.create({ data: { email, role: "ADMIN", emailVerified: true } });
    const attemptsBefore = sender.attempts.length;

    assert.equal((await requestCode(email)).status, 200);
    await tasks.drain();

    assert.equal(sender.attempts.length, attemptsBefore);
    assert.equal((await verificationRows(email)).length, 0);
  });

  // ADR 0004 consequences: code expiry and attempt limits on the stored Verification row (S15).
  it("stores a 300-second expiry and refuses an expired code without creating a user or session", async () => {
    const email = newEmail("expired");
    const before = Date.now();
    assert.equal((await requestCode(email)).status, 200);
    const after = Date.now();
    await tasks.drain();
    const code = codeFrom(sender.delivered.filter((message) => message.to === email).at(-1));

    const [row] = await verificationRows(email);
    assert.ok(row);
    assert.ok(row.expiresAt.getTime() >= before + CODE_LIFETIME_MS);
    assert.ok(row.expiresAt.getTime() <= after + CODE_LIFETIME_MS);

    // The stored expiry, not a process clock, decides: move it one second into the past.
    await prisma.verification.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await post("/sign-in/email-otp", { email, otp: code });

    assert.equal(expired.status, 400);
    assert.equal(((await expired.json()) as { code: string }).code, "OTP_EXPIRED");
    assert.deepEqual(expired.headers.getSetCookie(), []);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  it("refuses the right code after 3 wrong attempts and stores no user or session", async () => {
    const email = newEmail("attempts");
    assert.equal((await requestCode(email)).status, 200);
    await tasks.drain();
    const code = codeFrom(sender.delivered.filter((message) => message.to === email).at(-1));
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await post("/sign-in/email-otp", { email, otp: wrong });
      assert.equal(response.status, 400, `wrong attempt ${attempt}`);
      const [row] = await verificationRows(email);
      assert.equal(row?.value.endsWith(`:${attempt}`), true, "the attempt count is stored");
    }

    const fourth = await post("/sign-in/email-otp", { email, otp: code });
    assert.equal(fourth.status, 403);
    assert.equal(((await fourth.json()) as { code: string }).code, "TOO_MANY_ATTEMPTS");
    assert.deepEqual(fourth.headers.getSetCookie(), []);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    assert.equal((await verificationRows(email)).length, 0, "the exhausted code is deleted");
  });

  // S17 and S24: the request answers identically whatever the stored account, so it reveals nothing.
  it("answers a code request identically for unknown, customer, administrator, and DISABLED addresses", async () => {
    const unknown = newEmail("enum-unknown");
    const customer = newEmail("enum-customer");
    const administrator = newEmail("enum-admin");
    const disabled = newEmail("enum-disabled");
    await prisma.user.create({ data: { email: customer, emailVerified: true } });
    await prisma.user.create({ data: { email: administrator, role: "ADMIN" } });
    await prisma.user.create({ data: { email: disabled, status: "DISABLED" } });

    const answers = [];
    for (const email of [unknown, customer, administrator, disabled]) {
      answers.push(await snapshot(await requestCode(email)));
    }
    await tasks.drain();

    for (const answer of answers) {
      assert.deepEqual(answer, { status: 200, body: '{"success":true}', setCookie: [] });
    }
    const recipients = new Set(sender.delivered.map((message) => message.to));
    assert.deepEqual(
      [unknown, customer, administrator, disabled].map((email) => recipients.has(email)),
      [true, true, false, false],
    );
    assert.equal((await verificationRows(administrator)).length, 0);
    assert.equal((await verificationRows(disabled)).length, 0);
  });

  // S22: a code issued while the address was a customer never signs in an administrator.
  for (const state of ["pending", "enrolled", "expired"] as const) {
    it(`refuses an email-code session to an administrator (${state}) exactly like an invalid code`, async () => {
      const other = newEmail(`s22-control-${state}`);
      assert.equal((await requestCode(other)).status, 200);
      const email = newEmail(`s22-${state}`);
      assert.equal((await requestCode(email)).status, 200);
      await tasks.drain();
      const code = codeFrom(sender.delivered.filter((message) => message.to === email).at(-1));
      const control = codeFrom(sender.delivered.filter((message) => message.to === other).at(-1));
      const invalid = await snapshot(
        await post("/sign-in/email-otp", {
          email: other,
          otp: control === "000000" ? "111111" : "000000",
        }),
      );

      // The address becomes an administrator before the code is used.
      const user = await prisma.user.create({
        data: { email, role: "ADMIN", twoFactorEnabled: state === "enrolled" },
      });
      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: "not-a-real-hash",
          createdAt: new Date(Date.now() - (state === "expired" ? 25 * HOUR_MS : 0)),
        },
      });

      const refused = await snapshot(await post("/sign-in/email-otp", { email, otp: code }));

      assert.deepEqual(refused, invalid);
      assert.equal(invalid.status, 400);
      assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role,
        "ADMIN",
        "the code changed nothing on the account",
      );
    });
  }
});
