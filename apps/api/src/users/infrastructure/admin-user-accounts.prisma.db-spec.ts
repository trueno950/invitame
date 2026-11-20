import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import type { AuthService } from "@thallesp/nestjs-better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import {
  ADMIN_ACTION,
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASON,
} from "../../admin/domain/admin-action";
import { InvalidAdminActionError } from "../../admin/domain/admin-action.errors";
import { PrismaAdminActionRecorder } from "../../admin/infrastructure/prisma-admin-action-recorder";
import { emailCodeQuotaKey } from "../../auth/abuse-limits";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { BetterAuthSignInCodeResender } from "../../auth/sign-in-code/sign-in-code-resender";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../../test/database";
import {
  DisableAdminUserAccountUseCase,
  ReactivateAdminUserAccountUseCase,
  ResendSignInCodeUseCase,
} from "../application/admin-user-account.use-cases";
import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
  UserCannotSignInByCodeError,
} from "../domain/account-support.errors";
import { PrismaAdminUserAccountRepository } from "./prisma-admin-user-account.repository";

// The three account support actions on real PostgreSQL (M9 T9; S4, S6, L8, L9): each one's change and its `AdminAction`
// row committing together, every refusal writing nothing, an administrator account protected, a disable revoking the
// sessions (so an already-issued cookie stops working) while the owner's invitations stay published, a reactivate
// restoring the account enough for a new code sign-in, and the resend recording its request even when the existing
// per-email quota drops the code. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL
// that points at a disposable, already migrated local database.
//
// Two properties of the audit table shape the cleanup. `AdminAction` is append-only (its trigger refuses every UPDATE
// and DELETE) and its references are RESTRICT, so this suite cannot delete the audit rows it commits, nor the three
// accounts they name — the actor, the target, and the invitation each row may reference. The committed fixtures are
// therefore unique to this run and stay in the disposable database; `after` removes only the rows nothing references
// (the per-email `RateLimit` counters and the sign-in `Verification` rows) and then disconnects.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";
const CODE_PATTERN = /\b(\d{6})\b/;
const SESSION_COOKIE = "better-auth.session_token";
const CLIENT_IP_HEADER = "x-forwarded-for";
const RENDERER = "birthday-poster-01";

describe("account support actions on real PostgreSQL (M9 T9; S4, S6)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const sender = new InMemoryEmailSender();
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
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  const repository = new PrismaAdminUserAccountRepository(prisma, new PrismaAdminActionRecorder());
  const disable = new DisableAdminUserAccountUseCase(repository);
  const reactivate = new ReactivateAdminUserAccountUseCase(repository);
  // The production adapter, over this suite's own auth instance; `AuthService` is only the NestJS holder of `api`.
  const resend = new ResendSignInCodeUseCase(
    repository,
    new BetterAuthSignInCodeResender({ api: auth.api } as unknown as AuthService),
  );
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const emails: string[] = [];
  const clientAddresses = new ClientAddresses();
  let adminUserId = "";
  let templateVersionId = "";
  let packageId = "";
  let sequence = 0;

  function newEmail(label: string): string {
    const email = `m9-account-${label}-${runId}@example.test`;
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
          [CLIENT_IP_HEADER]: clientAddresses.next(),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  /** Signs in through the real email-code flow; returns the session cookie the sign-in set. */
  async function signInByCode(email: string): Promise<string> {
    assert.equal(
      (await post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status,
      200,
    );
    await tasks.drain();
    const message = sender.delivered.filter((sent) => sent.to === email).at(-1);
    const code = CODE_PATTERN.exec(message?.text ?? "")?.[1];
    assert.ok(code, "the customer received a code");
    const response = await post("/sign-in/email-otp", { email, otp: code });
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(cookie, "the sign-in set a session cookie");
    return cookie;
  }

  /** The session the application guard would read for this cookie: null once it is revoked or refused. */
  async function currentSession(cookie: string) {
    return auth.api.getSession({ headers: new Headers({ cookie }) });
  }

  async function newCustomer(label: string): Promise<{ userId: string; email: string }> {
    const email = newEmail(label);
    const created = await prisma.user.create({ data: { email } });
    return { userId: created.id, email };
  }

  async function newInvitation(ownerId: string, status: "DRAFT" | "PUBLISHED"): Promise<string> {
    sequence += 1;
    const at = new Date("2026-11-28T10:00:00.000Z");
    const created = await prisma.invitation.create({
      data: {
        ownerId,
        templateVersionId,
        packageId,
        slug: `m9-account-${runId}-${sequence}`,
        status,
        content: {},
        publishedAt: status === "PUBLISHED" ? at : null,
        firstPublishedAt: status === "PUBLISHED" ? at : null,
        archivedAt: null,
      },
    });
    return created.id;
  }

  async function auditRowsFor(userId: string) {
    return prisma.adminAction.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: "asc" },
    });
  }

  before(async () => {
    const admin = await prisma.user.create({
      data: { email: newEmail("actor"), role: "ADMIN" },
    });
    adminUserId = admin.id;

    const category = await prisma.category.create({
      data: { key: `m9-account-category-${runId}`, name: "Categoría" },
    });
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m9-account-template-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: "PUBLISHED",
        componentKey: RENDERER,
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: RENDERER },
      },
    });
    templateVersionId = version.id;
    const createdPackage = await prisma.package.create({
      data: { key: `m9-account-package-${runId}`, name: "Paquete", status: "ACTIVE" },
    });
    packageId = createdPackage.id;
  });

  after(async () => {
    try {
      await tasks.drain();
      // Only unreferenced rows: an audit row refuses the DELETE of itself and of the accounts and invitations it
      // names, and this disposable database removes them with it.
      await prisma.rateLimit.deleteMany({
        where: {
          OR: [
            { key: { in: emails.map(emailCodeQuotaKey) } },
            ...clientAddresses.rateLimitRows().OR,
          ],
        },
      });
      await prisma.verification.deleteMany({
        where: { identifier: { in: emails.map((email) => `sign-in-otp-${email}`) } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("disables an account, revokes its sessions, and commits the audit row with the change", async () => {
    // A new address that signs in by code, which creates the ACTIVE customer this scenario needs.
    const email = newEmail("disable");
    const cookie = await signInByCode(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const invitationId = await newInvitation(user.id, "PUBLISHED");
    assert.ok(await currentSession(cookie), "the session is valid before the disable");

    const result = await disable.execute({
      userId: user.id,
      adminUserId,
      reason: ADMIN_ACTION_REASON.ABUSE,
      note: "  Reporte de abuso.  ",
    });

    assert.deepEqual(result, { status: "DISABLED", revokedSessions: 1 });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status,
      "DISABLED",
    );
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal(await currentSession(cookie), null, "the revoked cookie opens no session");

    // L8: disabling blocks the account's access and keeps the owner's invitations published.
    const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    assert.equal(invitation.status, "PUBLISHED");
    assert.notEqual(invitation.publishedAt, null);

    const actions = await auditRowsFor(user.id);
    assert.equal(actions.length, 1, "one audit row for one disable");
    const action = actions[0];
    assert.ok(action);
    assert.equal(action.adminUserId, adminUserId);
    assert.equal(action.action, ADMIN_ACTION.ACCOUNT_DISABLED);
    assert.equal(action.reason, ADMIN_ACTION_REASON.ABUSE);
    assert.equal(action.note, "Reporte de abuso.", "the stored note is trimmed");
    assert.equal(action.invitationId, null);
  });

  it("protects an administrator account from both transitions and from a sign-in code", async () => {
    const administrator = await prisma.user.create({
      data: { email: newEmail("protected"), role: "ADMIN" },
    });
    const audit = {
      adminUserId,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      note: null,
    };

    await assert.rejects(
      disable.execute({ userId: administrator.id, ...audit }),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    await assert.rejects(
      reactivate.execute({ userId: administrator.id, ...audit }),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    await assert.rejects(
      resend.execute({ userId: administrator.id, ...audit }),
      (error: unknown) => error instanceof UserCannotSignInByCodeError,
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: administrator.id } });
    assert.equal(stored.status, "ACTIVE", "the administrator account never changed");
    assert.deepEqual(
      await auditRowsFor(administrator.id),
      [],
      "a refused action writes no audit row",
    );
  });

  it("refuses an account already in the target status, and an id no account has, writing nothing", async () => {
    const customer = await newCustomer("twice");
    const audit = { adminUserId, reason: ADMIN_ACTION_REASON.PAYMENT_ERROR, note: null };

    assert.deepEqual(await disable.execute({ userId: customer.userId, ...audit }), {
      status: "DISABLED",
      revokedSessions: 0,
    });
    await assert.rejects(
      disable.execute({ userId: customer.userId, ...audit }),
      (error: unknown) => error instanceof AccountAlreadyDisabledError,
    );
    assert.deepEqual(await reactivate.execute({ userId: customer.userId, ...audit }), {
      status: "ACTIVE",
    });
    await assert.rejects(
      reactivate.execute({ userId: customer.userId, ...audit }),
      (error: unknown) => error instanceof AccountAlreadyActiveError,
    );

    const unknown = randomUUID();
    assert.equal(await disable.execute({ userId: unknown, ...audit }), null);
    assert.equal(await reactivate.execute({ userId: unknown, ...audit }), null);
    assert.equal(await resend.execute({ userId: unknown, ...audit }), null);

    const actions = await auditRowsFor(customer.userId);
    assert.deepEqual(
      actions.map((action) => action.action),
      [ADMIN_ACTION.ACCOUNT_DISABLED, ADMIN_ACTION.ACCOUNT_REACTIVATED],
      "each refusal wrote nothing; only the two real changes are recorded",
    );
  });

  it("reactivates a disabled account and lets the guard accept it at a new code sign-in", async () => {
    const email = newEmail("reactivate");
    const cookie = await signInByCode(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const audit = {
      adminUserId,
      reason: ADMIN_ACTION_REASON.OTHER,
      note: "Se equivocó de cuenta.",
    };

    await disable.execute({ userId: user.id, ...audit });
    // A disabled account receives no code, so the sender's own refusal — not only this API's — keeps it out.
    const delivered = sender.delivered.length;
    await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    await tasks.drain();
    assert.equal(sender.delivered.length, delivered, "no code reached the disabled account");
    assert.equal(await currentSession(cookie), null);

    assert.deepEqual(await reactivate.execute({ userId: user.id, ...audit }), { status: "ACTIVE" });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status,
      "ACTIVE",
    );

    const actions = await auditRowsFor(user.id);
    assert.deepEqual(
      actions.map((action) => action.action),
      [ADMIN_ACTION.ACCOUNT_DISABLED, ADMIN_ACTION.ACCOUNT_REACTIVATED],
      "each change wrote its own audit row",
    );
    assert.ok(
      actions.every(
        (action) =>
          action.adminUserId === adminUserId &&
          action.reason === ADMIN_ACTION_REASON.OTHER &&
          action.note === "Se equivocó de cuenta.",
      ),
    );

    // The account signs in again: the guard reads the stored status on every request, so a new code now works.
    const renewed = await signInByCode(email);
    const session = await currentSession(renewed);
    assert.equal(session?.user.id, user.id);
  });

  it("records the resent code request before it, and reaches the same per-email quota as a customer", async () => {
    const customer = await newCustomer("resent");
    const audit = { adminUserId, reason: ADMIN_ACTION_REASON.OWNER_REQUEST, note: null };

    // Six requests in a row, each awaited to delivery: the fifth is the last code the per-email quota admits, and the
    // sixth is dropped by the sender exactly as it is for a customer's own request. The in-process call never meets the
    // per-IP limit, which only the HTTP router applies (M9 T9 finding in docs/architecture/overview.md).
    for (let request = 1; request <= 6; request += 1) {
      assert.deepEqual(await resend.execute({ userId: customer.userId, ...audit }), {
        outcome: "requested",
      });
      await tasks.drain();
    }

    assert.equal(
      sender.delivered.filter((message) => message.to === customer.email).length,
      5,
      "the per-email quota admitted five codes and dropped the sixth",
    );
    const quota = await prisma.rateLimit.findUnique({
      where: { key: emailCodeQuotaKey(customer.email) },
    });
    assert.ok(quota, "the per-email count is the existing RateLimit row, under its hashed key");
    assert.equal(quota.count, 5);

    const actions = await auditRowsFor(customer.userId);
    assert.equal(
      actions.length,
      6,
      "every request is recorded, including the one the quota dropped",
    );
    assert.ok(
      actions.every(
        (action) =>
          action.action === ADMIN_ACTION.SIGN_IN_CODE_RESENT && action.adminUserId === adminUserId,
      ),
    );
  });

  it("refuses a code for a disabled account and writes no audit row for it", async () => {
    const customer = await newCustomer("cannot-sign-in");
    await disable.execute({
      userId: customer.userId,
      adminUserId,
      reason: ADMIN_ACTION_REASON.ABUSE,
      note: null,
    });
    const before = (await auditRowsFor(customer.userId)).length;

    await assert.rejects(
      resend.execute({
        userId: customer.userId,
        adminUserId,
        reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
        note: null,
      }),
      (error: unknown) => error instanceof UserCannotSignInByCodeError,
    );
    assert.equal((await auditRowsFor(customer.userId)).length, before);
  });

  it("rolls the disable back when the audit entry is refused", async () => {
    // The note bypasses the DTO on purpose: the repository is a direct caller, and only the audit domain refuses a note
    // wider than the column. The refusal happens after the guarded update ran, so the rollback is what this proves.
    const email = newEmail("rollback");
    const cookie = await signInByCode(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    await assert.rejects(
      disable.execute({
        userId: user.id,
        adminUserId,
        reason: ADMIN_ACTION_REASON.OTHER,
        note: "a".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH + 1),
      }),
      (error: unknown) => error instanceof InvalidAdminActionError,
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.status, "ACTIVE", "the disable rolled back with the refused audit row");
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
    assert.ok(await currentSession(cookie), "the customer keeps their access");
    assert.deepEqual(await auditRowsFor(user.id), []);
  });
});
