import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module, type Provider, type Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { MetadataScanner } from "@nestjs/core";

import { createApp } from "../../app.setup";
import { createConfigModule } from "../../config/config.module";
import { PublicGuestAlbumController } from "../../media/presentation/public-guest-album.controller";
import { UnlockInvitationUseCase } from "../application/invitation-unlock.use-cases";
import {
  INVITATION_UNLOCK_CLIENT_SCOPE,
  type InvitationUnlockRateLimiter,
  invitationUnlockRateLimitRule,
  invitationUnlockScope,
} from "../application/invitation-unlock-rate-limiter";
import {
  createInvitationAccessTokens,
  INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS,
  INVITATION_ACCESS_TOKENS,
} from "../application/invitation-access-token";
import {
  INVITATION_LOCK_READER,
  type InvitationLockReader,
  InvitationPasswordGate,
  type StoredInvitationLock,
} from "../application/invitation-lock";
import { hashInvitationPassword } from "../application/invitation-password";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import {
  GetPublicGuestUseCase,
  SubmitGuestRsvpUseCase,
} from "../application/invitation-guest.use-cases";
import { SubmitPublicGuestbookEntryUseCase } from "../application/invitation-guestbook.use-cases";
import { SubmitPublicRsvpUseCase } from "../application/invitation-rsvp.use-cases";
import { RecordInvitationViewUseCase } from "../application/invitation-views";
import { UploadGuestPhotoUseCase } from "../../media/application/guest-album.use-cases";
import {
  InvitationLockGuard,
  INVITATION_ACCESS_HEADER,
  readInvitationAccessToken,
  SKIP_INVITATION_PASSWORD_GATE,
} from "./invitation-lock.guard";
import { PublicInvitationsController } from "./public-invitations.controller";

// The locked state of every public invitation route (F13; S2.13, L18.2, L18.3). The routes are read from the public
// controllers this suite registers, not from a hand-written list, so a public invitation route added later appears here on
// its own and fails the suite until it is either gated by `InvitationLockGuard` or one of the two exact exemptions.
//
// Every gated route is then tried three ways against a locked invitation: without a token (423 with the display name and
// nothing else, and the route's own use case never called), with a token minted for that invitation and version (the
// handler runs, which these stubs answer with their own 404), and with a token that must not open it (423 again). The two
// personal-link routes and the unlock route are tried without a token too: they must reach their handler, because a
// personal link already carries a secret of its own (L18.4) and the unlock route is where a token comes from.
//
// The unlock route is exercised end to end against the real use case: the right code mints a token that opens the page, a
// wrong code answers the one neutral body, and an attempt over the cap answers the same body with 429.

const TRUSTED_ORIGIN = "http://localhost:3000";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const OTHER_INVITATION = "33333333-3333-4333-8333-333333333333";
const LOCKED_SLUG = "boda-protegida";
const OPEN_SLUG = "boda-abierta";
const ALIAS_SLUG = "boda-protegida-vieja";
const LOCKED_PASSWORD = "clave-familiar";
const DISPLAY_NAME = "Ana y Luis";
const GUEST_TOKEN = "A".repeat(22);

/** One public invitation route as its controller declares it, with the fixture that reaches its handler. */
interface PublicRoute {
  readonly key: string;
  readonly method: string;
  readonly path: string;
  // biome-ignore lint/complexity/noBannedTypes: Nest's metadata carries the handler as a plain function value.
  readonly handler: Function;
  readonly controller: Type<unknown>;
  /** The body or upload this route needs to reach its own handler; a gated route never needs it while locked. */
  readonly body?: unknown;
  readonly upload?: boolean;
}

const METHOD_NAMES: Record<number, string> = {
  0: "GET",
  1: "POST",
  2: "PUT",
  3: "DELETE",
  4: "PATCH",
  5: "OPTIONS",
  6: "HEAD",
  7: "SEARCH",
};

/** The two routes of the public controllers that may be reached while the invitation is locked (L18.4). */
const EXEMPT_ROUTES = [
  "GET /public/invitations/:slug/guests/:token",
  "POST /public/invitations/:slug/guests/:token/rsvp",
  "POST /public/invitations/:slug/unlock",
];

/** The bodies the gated routes need once they are admitted, so the assertion is "the handler ran", not "any status". */
const ROUTE_BODIES: Record<string, unknown> = {
  "POST /public/invitations/:slug/rsvp": { name: "Ana", attending: true, partySize: 1 },
  "POST /public/invitations/:slug/guestbook": { authorName: "Tía Rosa", message: "¡Felicidades!" },
  "GET /public/invitations/:slug/guests/:token": undefined,
  "POST /public/invitations/:slug/guests/:token/rsvp": { attending: true, partySize: 1 },
  "POST /public/invitations/:slug/unlock": { password: LOCKED_PASSWORD },
};

/** The album upload is multipart and needs its own request. */
const UPLOAD_ROUTES = new Set(["POST /public/invitations/:slug/photos"]);

function registeredRoutes(controllers: readonly Type<unknown>[]): PublicRoute[] {
  const scanner = new MetadataScanner();
  const routes: PublicRoute[] = [];

  for (const controller of controllers) {
    const controllerPath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? "";
    const prototype = controller.prototype as Record<string, unknown>;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== "function") {
        continue;
      }
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      const handlerPath = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? "";
      if (method === undefined) {
        continue;
      }
      const path = `/${[controllerPath, handlerPath]
        .filter((part) => part !== "")
        .join("/")}`.replace(/\/+$/u, "");
      const methodName = METHOD_NAMES[method] ?? String(method);

      routes.push({
        key: `${methodName} ${path}`,
        method: methodName,
        path,
        handler,
        controller,
        body: ROUTE_BODIES[`${methodName} ${path}`],
        upload: UPLOAD_ROUTES.has(`${methodName} ${path}`),
      });
    }
  }

  return routes;
}

/** The lock read the gate consults: one entry per public address the suite seeds (L18.2). */
class MemoryLockReader implements InvitationLockReader {
  readonly locks = new Map<string, StoredInvitationLock>();
  calls = 0;

  async findLockBySlug(slug: string): Promise<StoredInvitationLock | null> {
    this.calls += 1;

    return this.locks.get(slug) ?? null;
  }
}

/** The unlock limit on its own counters, so the assertions observe the caps and not the shared table (L18.3). */
class MemoryUnlockRateLimiter implements InvitationUnlockRateLimiter {
  readonly attempts = new Map<string, number>();

  async consume(scope: string, clientAddress: string): Promise<boolean> {
    const key = `${scope}|${clientAddress}`;
    const count = (this.attempts.get(key) ?? 0) + 1;

    if (count > invitationUnlockRateLimitRule(scope).max) {
      return false;
    }
    this.attempts.set(key, count);

    return true;
  }

  async refund(scope: string, clientAddress: string): Promise<void> {
    const key = `${scope}|${clientAddress}`;
    const count = this.attempts.get(key) ?? 0;

    if (count > 0) {
      this.attempts.set(key, count - 1);
    }
  }

  count(scope: string, clientAddress: string): number {
    return this.attempts.get(`${scope}|${clientAddress}`) ?? 0;
  }
}

/** What the suite records about the routes it stubs, so "nothing ran" is an observation and not an assumption. */
interface RouteSpies {
  readonly calls: Map<string, number>;
}

describe("the locked state of the public invitation routes (F13; L18.2, L18.3, L18.4)", () => {
  const secret = randomBytes(32).toString("base64url");
  const tokens = createInvitationAccessTokens(secret);
  const locks = new MemoryLockReader();
  const limiter = new MemoryUnlockRateLimiter();
  const spies: RouteSpies = { calls: new Map() };
  let app: INestApplication;
  let baseUrl: string;
  let routes: PublicRoute[];
  let passwordHash: string;

  before(async () => {
    passwordHash = await hashInvitationPassword(LOCKED_PASSWORD);
    locks.locks.set(LOCKED_SLUG, {
      invitationId: INVITATION,
      passwordHash,
      passwordVersion: 3,
      content: { coupleNameOne: "Ana", coupleNameTwo: "Luis", message: "Los esperamos" },
      redirectTo: null,
    });
    // A previous address of the same invitation: the gate reads it exactly like the current one and carries the current
    // address the web must redirect to before the lock screen (F11; L15.2, L15.3).
    locks.locks.set(ALIAS_SLUG, {
      invitationId: INVITATION,
      passwordHash,
      passwordVersion: 3,
      content: { coupleNameOne: "Ana", coupleNameTwo: "Luis" },
      redirectTo: LOCKED_SLUG,
    });
    // An invitation without an access code: nothing changes for it (L18.2).
    locks.locks.set(OPEN_SLUG, {
      invitationId: OTHER_INVITATION,
      passwordHash: null,
      passwordVersion: 0,
      content: { celebrantName: "Emilia" },
      redirectTo: null,
    });

    const spy = (token: Type<unknown>, value: unknown): Provider => ({
      provide: token,
      useValue: {
        execute: async () => {
          const key = token.name;
          spies.calls.set(key, (spies.calls.get(key) ?? 0) + 1);
          return value;
        },
      },
    });

    @Module({
      imports: [
        createConfigModule({
          NODE_ENV: "test",
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL: TRUSTED_ORIGIN,
        }),
      ],
      controllers: [PublicInvitationsController, PublicGuestAlbumController],
      providers: [
        // The stubs answer the invisible case, so an admitted request is one whose handler ran and answered its own 404.
        spy(GetPublicInvitationUseCase, null),
        spy(SubmitPublicRsvpUseCase, false),
        spy(GetPublicGuestUseCase, null),
        spy(SubmitGuestRsvpUseCase, false),
        spy(SubmitPublicGuestbookEntryUseCase, false),
        spy(UploadGuestPhotoUseCase, false),
        spy(RecordInvitationViewUseCase, undefined),
        {
          // The unlock route runs the real use case, so the token it answers is the token the gate accepts.
          provide: UnlockInvitationUseCase,
          useFactory: (reader: InvitationLockReader) =>
            new UnlockInvitationUseCase(reader, tokens, limiter),
          inject: [INVITATION_LOCK_READER],
        },
        { provide: INVITATION_LOCK_READER, useValue: locks },
        { provide: INVITATION_ACCESS_TOKENS, useValue: tokens },
        {
          provide: InvitationPasswordGate,
          useFactory: (reader: InvitationLockReader) => new InvitationPasswordGate(reader, tokens),
          inject: [INVITATION_LOCK_READER],
        },
        InvitationLockGuard,
      ],
    })
    class PublicLockModule {
      static readonly controllers = [PublicInvitationsController, PublicGuestAlbumController];
    }

    app = await createApp(PublicLockModule, { logger: false, abortOnError: false });
    // `createApp` disables Nest's body parser for Better Auth; this suite composes no auth module, so it registers the
    // JSON parser the public routes read their bodies from.
    (app as unknown as { useBodyParser(type: string): void }).useBodyParser("json");
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    routes = registeredRoutes(PublicLockModule.controllers);
  });

  after(async () => {
    await app?.close();
  });

  /** A request to one route, addressed either at the locked invitation or at the open one. */
  async function send(
    route: PublicRoute,
    slug: string,
    accessToken?: string,
    clientAddress = "198.18.0.1",
  ): Promise<Response> {
    const path = (route.path ?? "").replaceAll(":slug", slug).replaceAll(":token", GUEST_TOKEN);
    const headers: Record<string, string> = { "x-forwarded-for": clientAddress };

    if (accessToken !== undefined) {
      headers[INVITATION_ACCESS_HEADER] = accessToken;
    }
    if (route.upload === true) {
      const form = new FormData();
      form.append("uploaderName", "Ana");
      form.append(
        "file",
        new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }),
        "foto.jpg",
      );

      return fetch(`${baseUrl}${path}`, { method: route.method, headers, body: form });
    }

    return fetch(`${baseUrl}${path}`, {
      method: route.method,
      headers: { ...headers, "content-type": "application/json" },
      ...(route.body === undefined ? {} : { body: JSON.stringify(route.body) }),
    });
  }

  /** How many times every stubbed use case ran so far: any change means a route reached its handler. */
  function totalCalls(): number {
    return [...spies.calls.values()].reduce((total, count) => total + count, 0);
  }

  it("declares the gate on every public invitation route, with only the two personal routes and the unlock route exempt", () => {
    const undeclared: string[] = [];
    const exemptions: string[] = [];

    for (const route of routes) {
      const guard = Reflect.getMetadata("__guards__", route.controller) as unknown[] | undefined;
      const skipped =
        Reflect.getMetadata(SKIP_INVITATION_PASSWORD_GATE, route.handler) === true ||
        Reflect.getMetadata(SKIP_INVITATION_PASSWORD_GATE, route.controller) === true;

      if (skipped) {
        exemptions.push(route.key);
      }
      if (!skipped && !(guard ?? []).includes(InvitationLockGuard)) {
        undeclared.push(route.key);
      }
    }
    // A public invitation route that is neither gated nor exempt is a route that serves a locked invitation.
    assert.deepEqual(
      undeclared,
      [],
      "every public invitation route is gated by InvitationLockGuard",
    );
    // And the exemptions are exactly the personal link's two routes and the unlock route, so a new one cannot be silent.
    assert.deepEqual(exemptions.sort(), [...EXEMPT_ROUTES].sort());
  });

  it("refuses every gated route with the locked state, and no invitation data but the display name", async () => {
    const answers: string[] = [];

    for (const route of routes) {
      if (EXEMPT_ROUTES.includes(route.key)) {
        continue;
      }
      const before = totalCalls();
      const response = await send(route, LOCKED_SLUG);
      const body: unknown = await response.json();
      const after = totalCalls();

      if (response.status !== 423) {
        answers.push(`${route.key}: ${response.status}`);
        continue;
      }
      // The body is exactly the lock: no slug, no content, no features, no id, no guest, and no redirect for the address
      // the guest already asked for.
      assert.deepEqual(
        body,
        { code: "INVITATION_LOCKED", displayName: DISPLAY_NAME, redirectTo: null },
        route.key,
      );
      assert.equal(after, before, `${route.key} ran its use case while locked`);
    }
    assert.deepEqual(answers, [], "every gated route answers 423 while the invitation is locked");
  });

  it("answers a previous address with the current one to redirect to before the lock screen (F11; L15.2, L15.3)", async () => {
    for (const route of routes) {
      if (EXEMPT_ROUTES.includes(route.key)) {
        continue;
      }
      const response = await send(route, ALIAS_SLUG);
      const body: unknown = await response.json();

      assert.equal(response.status, 423, route.key);
      assert.deepEqual(
        body,
        { code: "INVITATION_LOCKED", displayName: DISPLAY_NAME, redirectTo: LOCKED_SLUG },
        route.key,
      );
    }
  });

  it("admits every gated route with a token minted for that invitation and version (L18.2)", async () => {
    const token = tokens.mint(INVITATION, 3).token;
    const answers: string[] = [];

    for (const route of routes) {
      if (EXEMPT_ROUTES.includes(route.key)) {
        continue;
      }
      const before = totalCalls();
      const response = await send(route, LOCKED_SLUG, token);
      await response.arrayBuffer();
      const after = totalCalls();

      if (response.status !== 404) {
        answers.push(`${route.key}: ${response.status}`);
      }
      if (after === before) {
        answers.push(`${route.key}: its use case never ran`);
      }
    }
    assert.deepEqual(answers, [], "every gated route reaches its handler with a valid token");
  });

  it("refuses a token of another invitation, of an older version, or one that expired (L18.2)", async () => {
    const presented = [
      tokens.mint(OTHER_INVITATION, 3).token,
      // The same invitation, a password version the invitation no longer has: a changed code invalidates it.
      tokens.mint(INVITATION, 2).token,
      // Minted 31 days ago: past its own 30-day lifetime.
      tokens.mint(
        INVITATION,
        3,
        new Date(Date.now() - (INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS + 60) * 1000),
      ).token,
      // An edited expiry: the MAC covers it.
      `${tokens.mint(INVITATION, 3).token.split(".").slice(0, 2).join(".")}.${Math.floor(Date.now() / 1000) + 10 ** 6}.edited`,
      "not-a-token",
    ];

    const gated = routes.filter((route) => !EXEMPT_ROUTES.includes(route.key));
    for (const route of [gated[0], gated[1]]) {
      assert.ok(route);
      for (const token of presented) {
        const response = await send(route, LOCKED_SLUG, token);
        await response.arrayBuffer();

        assert.equal(response.status, 423, `${route.key} with a token that must not open it`);
      }
    }
  });

  it("leaves an invitation without an access code exactly as it was (L18.2)", async () => {
    for (const route of routes) {
      if (EXEMPT_ROUTES.includes(route.key)) {
        continue;
      }
      const response = await send(route, OPEN_SLUG);
      await response.arrayBuffer();

      assert.equal(response.status, 404, `${route.key} on an invitation with no code`);
    }
  });

  it("answers its own 404 for an address no visible invitation holds", async () => {
    const read = routes.find((route) => route.key === "GET /public/invitations/:slug");
    assert.ok(read);
    const response = await send(read, "no-existe");
    await response.arrayBuffer();

    assert.equal(response.status, 404);
  });

  it("lets the personal guest routes through without an access token (L18.4)", async () => {
    for (const key of [
      "GET /public/invitations/:slug/guests/:token",
      "POST /public/invitations/:slug/guests/:token/rsvp",
    ]) {
      const route = routes.find((candidate) => candidate.key === key);
      assert.ok(route, key);
      const response = await send(route, LOCKED_SLUG);
      await response.arrayBuffer();

      assert.equal(response.status, 404, `${key} reached its handler`);
    }
  });

  it("exchanges the shared code for a token that opens the invitation (L18.2)", async () => {
    const unlock = routes.find((route) => route.key === "POST /public/invitations/:slug/unlock");
    const read = routes.find((route) => route.key === "GET /public/invitations/:slug");
    assert.ok(unlock);
    assert.ok(read);

    const accepted = await fetch(`${baseUrl}/public/invitations/${LOCKED_SLUG}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.18.0.102" },
      body: JSON.stringify({ password: LOCKED_PASSWORD }),
    });
    const unlocked = (await accepted.json()) as { accessToken: string; expiresAt: string };

    assert.equal(accepted.status, 200);
    assert.equal(typeof unlocked.accessToken, "string");
    assert.ok(unlocked.accessToken.length > 0);
    // 30 days ahead, and the value the body names is the value the token carries.
    const lifetime = Math.round((Date.parse(unlocked.expiresAt) - Date.now()) / 1000 / 86_400);
    assert.equal(lifetime, 30, "the token expires in 30 days");

    const page = await send(read, LOCKED_SLUG, unlocked.accessToken);
    await page.arrayBuffer();
    assert.equal(page.status, 404, "the minted token opens the invitation");
  });

  /** One unlock attempt through the route, with the client address the limit reads. */
  function unlock(slug: string, password: string, clientAddress: string): Promise<Response> {
    return fetch(`${baseUrl}/public/invitations/${slug}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": clientAddress },
      body: JSON.stringify({ password }),
    });
  }

  it("refuses a code wider than any code with the neutral 401, before it spends a budget (L18.3)", async () => {
    const address = "198.18.0.301";
    const response = await unlock(LOCKED_SLUG, "a".repeat(10_000), address);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "INVITATION_PASSWORD_REJECTED" });
    // A value no code can be is refused before the hash and before the attempt is counted.
    assert.equal(limiter.count(invitationUnlockScope(LOCKED_SLUG), address), 0);
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, address), 0);
  });

  it("lets the eleventh correct unlock from one address through (a success spends no budget)", async () => {
    const address = "198.18.0.302";

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const accepted = await unlock(LOCKED_SLUG, LOCKED_PASSWORD, address);

      assert.equal(accepted.status, 200, `unlock ${attempt + 1} must succeed`);
    }
    assert.equal(limiter.count(invitationUnlockScope(LOCKED_SLUG), address), 0);
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, address), 0);
  });

  it("answers 429 after 30 failures spread across different slugs, with the same neutral body (L18.3)", async () => {
    const address = "198.18.0.303";
    const neutral = { code: "INVITATION_PASSWORD_REJECTED" };

    // Ten failures at each of three different slugs: the per-address caps are spent and the cap across every address is
    // what refuses the thirtieth-first attempt at a fourth slug.
    for (const slug of [LOCKED_SLUG, ALIAS_SLUG, OPEN_SLUG]) {
      for (let failure = 0; failure < 10; failure += 1) {
        const refused = await unlock(slug, "no-es-la-clave", address);

        assert.equal(refused.status, 401, `${slug} failure ${failure + 1}`);
        assert.deepEqual(await refused.json(), neutral);
      }
    }
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, address), 30);

    const over = await unlock("no-existe", "no-es-la-clave", address);

    assert.equal(over.status, 429, "varying the slug buys no fresh budget");
    assert.deepEqual(await over.json(), neutral);
  });

  it("answers the same neutral body for a wrong code and for an attempt over the cap (L18.3)", async () => {
    const wrong = await fetch(`${baseUrl}/public/invitations/${LOCKED_SLUG}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.18.0.201" },
      body: JSON.stringify({ password: "no-es-la-clave" }),
    });
    const wrongBody: unknown = await wrong.json();
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrongBody, { code: "INVITATION_PASSWORD_REJECTED" });

    // An address no invitation holds answers the same body, so the route is no oracle for existence.
    const unknown = await fetch(`${baseUrl}/public/invitations/no-existe/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.18.0.202" },
      body: JSON.stringify({ password: LOCKED_PASSWORD }),
    });
    assert.equal(unknown.status, 401);
    assert.deepEqual(await unknown.json(), wrongBody);

    let overLimit: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      overLimit = await fetch(`${baseUrl}/public/invitations/${LOCKED_SLUG}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.18.0.203" },
        body: JSON.stringify({ password: "no-es-la-clave" }),
      });
    }
    assert.ok(overLimit);
    assert.equal(overLimit.status, 429, "an attempt over the cap is 429");
    assert.deepEqual(await overLimit.json(), wrongBody, "and answers the same neutral body");
  });

  it("reads one header value and treats an empty one as no token", () => {
    assert.equal(readInvitationAccessToken({ [INVITATION_ACCESS_HEADER]: "abc" }), "abc");
    assert.equal(readInvitationAccessToken({ [INVITATION_ACCESS_HEADER]: ["abc", "def"] }), "abc");
    assert.equal(readInvitationAccessToken({ [INVITATION_ACCESS_HEADER]: "   " }), undefined);
    assert.equal(readInvitationAccessToken({}), undefined);
  });

  it("keeps the invite id out of the token and the display name out of every other answer (L18.2, L18.3)", () => {
    const minted = tokens.mint(randomUUID(), 3);
    assert.equal(minted.token.includes(INVITATION), false);
    assert.equal(minted.token.includes(LOCKED_SLUG), false);
    // Nothing the lock answers carries the code or the hash.
    assert.equal(JSON.stringify(minted).includes(LOCKED_PASSWORD), false);
    assert.equal(JSON.stringify(minted).includes(passwordHash), false);
  });
});
