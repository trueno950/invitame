import "reflect-metadata";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Controller, Get, type INestApplication, Module, Param } from "@nestjs/common";

import { createApp } from "../../app.setup";
import { createConfigModule } from "../../config/config.module";
import { InvitationCallerAccess, InvitationOwnerId } from "./invitation-scope";

// The two request decorators the invitation routes read their owner and their caller's access from (F12; L17.4). They
// are the only way a route learns the owner, so what they answer when the guard attached nothing is an authorization
// decision, not a detail: a route that lost its guard must answer the invitation's 404, never run as the path id (which
// is not an owner) and never run as the session user (which would treat a collaborator as the owner). This suite mounts
// those two decorators on a controller without the guard — the exact situation the fallback existed for — and observes
// the answer at the HTTP boundary, where every route sees it.

const INVITATION = "22222222-2222-4222-8222-222222222222";

@Controller("scoped")
class ScopedController {
  @Get(":id")
  read(@InvitationOwnerId() ownerId: string): { ownerId: string } {
    return { ownerId };
  }

  @Get(":id/access")
  access(@InvitationCallerAccess() access: unknown): unknown {
    return access;
  }

  @Get(":id/echo/:value")
  echo(
    @Param("value") value: string,
    @InvitationOwnerId() ownerId: string,
  ): { ownerId: string; value: string } {
    return { ownerId, value };
  }
}

describe("the invitation request decorators without a resolved access (F12; L17.4)", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    @Module({
      imports: [
        createConfigModule({
          NODE_ENV: "development",
          CORS_ORIGIN: "http://localhost:3000",
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: "a".repeat(32),
          AUTH_BASE_URL: "http://localhost:3000",
        }),
      ],
      controllers: [ScopedController],
    })
    class ScopedModule {}

    app = await createApp(ScopedModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  it("answers the invitation's 404 instead of the path id as the owner", async () => {
    const response = await fetch(`${baseUrl}/scoped/${INVITATION}`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
  });

  it("answers the same 404 for a path id that is not a stored id, so no route runs with it", async () => {
    for (const value of ["not-a-uuid", "1", "22222222-2222-4222-8222"]) {
      const response = await fetch(`${baseUrl}/scoped/${value}`);

      assert.equal(response.status, 404, value);
      const body = await response.text();
      assert.equal(body.includes(value), false, `${value} never becomes the owner`);
      assert.deepEqual(JSON.parse(body), { code: "INVITATION_NOT_FOUND" });
    }
  });

  it("answers the invitation's 404 instead of the session user when the guard resolved nothing", async () => {
    const response = await fetch(`${baseUrl}/scoped/${INVITATION}/echo/${INVITATION}`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
  });

  it("keeps answering the invitation's 404 for the caller's access", async () => {
    const response = await fetch(`${baseUrl}/scoped/${INVITATION}/access`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
  });
});
