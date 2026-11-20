import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";
import { ADMIN_ACTION_RECORDER, type AdminActionRecorder } from "./admin-action-recorder";
import { PrismaAdminActionRecorder } from "./infrastructure/prisma-admin-action-recorder";

// AdminModule wiring in AppModule (M9 T6; S4, S6): the audit recorder exists as a provider another module can inject,
// and it is the Prisma adapter that takes the caller's transaction. A Prisma stub stands in for the database, so the
// suite never connects to one; this slice serves no route yet, so there is nothing to request.

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

describe("AppModule administrator audit wiring", () => {
  let app: INestApplication;

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
  });

  after(async () => {
    await app?.close();
  });

  it("exports the audit recorder the modules that change state inject (S6)", () => {
    const recorder = app.get<AdminActionRecorder>(ADMIN_ACTION_RECORDER, { strict: false });

    assert.ok(recorder instanceof PrismaAdminActionRecorder);
  });
});
