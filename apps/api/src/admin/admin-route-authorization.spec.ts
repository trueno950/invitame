import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

import {
  Controller,
  Get,
  Global,
  type INestApplication,
  Module,
  RequestMethod,
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";

// Every administrator route, derived from the application's real module graph (M9 T10; S4, S6). `@AdminOnly()` on the
// controller (or on a handler) is the only thing that makes the global guard answer 403 to a signed-in customer, and a
// handler is unguarded unless the marker is on it or its class; `@Public()` would let it through with no session at
// all. This suite reflects over the controllers `AppModule` actually registers, takes the routes whose path starts with
// `admin/`, and asserts that each one carries the administrator marker and none carries the public one — so a new
// admin route added without the decorator fails here instead of shipping unprotected.
//
// The metadata keys are symbols the access-control module keeps private, so they are read by their declared
// descriptions (`access-control.ts`: `Symbol("invitame:admin-only")`, `Symbol("invitame:public-route")`).

const ADMIN_ONLY = "invitame:admin-only";
const PUBLIC_ROUTE = "invitame:public-route";
const ADMIN_PREFIX = "admin/";

/** The value of a symbol-valued metadata key, found by the description the access-control module declares. */
function marker(target: object, description: string): unknown {
  const key = Reflect.getOwnMetadataKeys(target).find(
    (candidate) => typeof candidate === "symbol" && candidate.description === description,
  );
  return key === undefined ? undefined : Reflect.getOwnMetadata(key, target);
}

function isMarked(target: object, description: string): boolean {
  return marker(target, description) === true;
}

/** One route a controller exposes, with the two access markers that decide who may call it. */
interface RouteEntry {
  /** `Controller.handler`, for a failure message that names the source. */
  readonly name: string;
  /** `GET /admin/users/:userId/disable`-shaped, so the report reads like the API's own routes. */
  readonly route: string;
  readonly adminOnly: boolean;
  readonly publicRoute: boolean;
}

/** The declared paths of a `@Controller()`, `@Get()`, or `@Post()`: a string, a list, or `{ path }`. */
function declaredPaths(target: object): string[] {
  const declared: unknown = Reflect.getMetadata(PATH_METADATA, target);
  const entries = Array.isArray(declared) ? declared : [declared];

  return entries.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }
    if (typeof entry === "object" && entry !== null) {
      const path = (entry as { path?: unknown }).path;
      return typeof path === "string" ? [path] : [];
    }
    return [];
  });
}

function routePath(...segments: string[]): string {
  return `/${segments
    .flatMap((segment) => segment.split("/"))
    .filter((segment) => segment !== "")
    .join("/")}`;
}

/** A controller class: the constructor the module registered, with its declared name and prototype. */
interface ControllerClass {
  readonly name: string;
  readonly prototype: object;
}

/** Every route handler of one controller, with the markers its handler or its class carries. */
function routeEntriesOf(controller: ControllerClass, scanner: MetadataScanner): RouteEntry[] {
  const prefixes = declaredPaths(controller);
  const prototype = controller.prototype as Record<string, unknown>;

  return scanner.getAllMethodNames(prototype).flatMap((name) => {
    const handler = prototype[name];
    if (typeof handler !== "function") {
      return [];
    }
    const method: unknown = Reflect.getOwnMetadata(METHOD_METADATA, handler);
    if (method === undefined) {
      return [];
    }

    const verb = typeof method === "number" ? (RequestMethod[method] ?? "ROUTE") : String(method);
    const handlerPath = declaredPaths(handler)[0] ?? "";

    return [
      {
        name: `${controller.name}.${name}`,
        route: `${verb} ${routePath(...prefixes, handlerPath)}`,
        adminOnly: isMarked(handler, ADMIN_ONLY) || isMarked(controller, ADMIN_ONLY),
        publicRoute: isMarked(handler, PUBLIC_ROUTE) || isMarked(controller, PUBLIC_ROUTE),
      },
    ];
  });
}

/** The entries that would answer an administrator-only expectation wrongly: unmarked, or public. */
function violations(entries: readonly RouteEntry[]): string[] {
  return entries
    .filter((entry) => !entry.adminOnly || entry.publicRoute)
    .map(
      (entry) =>
        `${entry.name} (${entry.route}) is ${entry.publicRoute ? "a public route" : "not @AdminOnly()"}`,
    );
}

/** An admin probe nothing decorates and an admin probe marked public: the negative controls. */
@Controller("admin/undecorated-probe")
class UndecoratedAdminProbeController {
  @Get()
  list(): string {
    return "";
  }
}

/** A Prisma stub, global like the real module, so no Prisma client is constructed and no database is read. */
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

describe("administrator route authorization (M9 T10; S4, S6)", () => {
  let app: INestApplication;
  let discovery: DiscoveryService;
  let scanner: MetadataScanner;
  let adminRoutes: RouteEntry[];

  before(async () => {
    app = await createApp(
      AppModule.forRoot({
        environment: {
          NODE_ENV: "test",
          CORS_ORIGIN: "http://localhost:3000",
          // Syntactically valid and never connected: the stub replaces the Prisma client.
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          AUTH_BASE_URL: "http://localhost:3000",
        },
        database: StubDatabaseModule,
      }),
      { logger: false, abortOnError: false },
    );
    await app.init();
    discovery = app.get(DiscoveryService, { strict: false });
    scanner = app.get(MetadataScanner, { strict: false });

    adminRoutes = discovery
      .getControllers()
      .flatMap((wrapper) => {
        const controller: unknown = wrapper.metatype;
        return typeof controller === "function" ? [controller] : [];
      })
      .filter((controller) =>
        declaredPaths(controller).some((path) => routePath(path).slice(1).startsWith(ADMIN_PREFIX)),
      )
      .flatMap((controller) => routeEntriesOf(controller, scanner));
  });

  after(async () => {
    await app?.close();
  });

  it("derives the administrator routes from AppModule instead of a hand-written list", () => {
    const routes = adminRoutes.map((entry) => entry.route);

    assert.ok(adminRoutes.length > 0, "AppModule registers administrator routes");
    for (const expected of [
      "POST /admin/users/:userId/disable",
      "POST /admin/users/:userId/reactivate",
      "POST /admin/users/:userId/sign-in-code",
      "POST /admin/invitations/:invitationId/unpublish",
      "GET /admin/invitations",
      "GET /admin/payments/:paymentId",
    ]) {
      assert.ok(
        routes.includes(expected),
        `the derivation finds ${expected} in ${routes.join(", ")}`,
      );
    }
  });

  it("marks every administrator route and handler @AdminOnly(), and none @Public()", () => {
    assert.deepEqual(violations(adminRoutes), []);
  });

  it("catches an administrator route that carries neither marker, so a new one cannot slip through", () => {
    const probe = routeEntriesOf(UndecoratedAdminProbeController, scanner);

    assert.deepEqual(
      probe.map((entry) => [entry.route, entry.adminOnly, entry.publicRoute]),
      [["GET /admin/undecorated-probe", false, false]],
    );
    assert.equal(violations(probe).length, 1);
  });
});
