import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module, type Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";
import {
  InvitationsModule,
  INVITATION_USE_CASES,
  ADMIN_ANALYTICS_USE_CASES,
} from "../invitations/invitations.module";
import { MediaModule } from "../media/media.module";
import { OPERATIONAL_SETTINGS_READER } from "./application/operational-settings";
import { PrismaOperationalSettingsRepository } from "./infrastructure/prisma-operational-settings.repository";
import { SettingsModule } from "./settings.module";

// The settings module in the application graph (M9 T13; S5, S8, L15). What this suite owns is the wiring the consumers
// depend on: the module exports the read contract, both consuming modules import it, every consumer provider injects the
// token, and `AppModule` resolves the token to the Prisma adapter. The behavior of each consumer is proved in its own
// suite, and the SQL in `operational-settings.prisma.db-spec.ts`; a Prisma stub stands in for the database, so this
// suite never connects to one.

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

function moduleMetadata(key: string, target: object): unknown[] {
  const value: unknown = Reflect.getMetadata(key, target);

  return Array.isArray(value) ? value : [];
}

/** The `inject` list of one provider, as Nest stores it in the module metadata. */
function injectedTokensOf(providers: readonly Provider[]): unknown[][] {
  return providers.flatMap((provider) => {
    if (typeof provider !== "object" || provider === null || !("provide" in provider)) {
      return [];
    }
    const inject: unknown = (provider as { inject?: unknown }).inject;

    return Array.isArray(inject) ? [inject] : [];
  });
}

describe("AppModule operational settings wiring (M9 T13; S5, S8, L15)", () => {
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

  it("binds the read contract to the Prisma adapter, so a consumer reads the row on every call", () => {
    const reader = app.get(OPERATIONAL_SETTINGS_READER, { strict: false });

    assert.ok(reader instanceof PrismaOperationalSettingsRepository);
    assert.equal(typeof reader.current, "function");
  });

  it("exports the read contract and is imported by the two modules that consume it", () => {
    assert.ok(
      moduleMetadata(MODULE_METADATA.EXPORTS, SettingsModule).includes(OPERATIONAL_SETTINGS_READER),
    );
    assert.ok(moduleMetadata(MODULE_METADATA.IMPORTS, InvitationsModule).includes(SettingsModule));
    assert.ok(moduleMetadata(MODULE_METADATA.IMPORTS, MediaModule).includes(SettingsModule));
  });

  it("injects the reader into every invitations consumer that checks a limit", () => {
    const providers = [
      ...INVITATION_USE_CASES,
      ...ADMIN_ANALYTICS_USE_CASES,
      ...moduleMetadata(MODULE_METADATA.PROVIDERS, InvitationsModule),
    ] as Provider[];
    const consumers = new Set<string>([
      "CreateInvitationDraftUseCase",
      "UpdateRsvpSettingsUseCase",
      "SubmitPublicRsvpUseCase",
      "SearchPlacesUseCase",
      "GetAdminViewsAnalyticsUseCase",
      "GetAdminFunnelAnalyticsUseCase",
    ]);

    const injected = injectedTokensOf(providers).filter((tokens) =>
      tokens.some((token) => token === OPERATIONAL_SETTINGS_READER),
    );
    assert.ok(
      injected.length >= consumers.size,
      `every consumer provider injects the reader: ${injected.length} of ${consumers.size}`,
    );
  });

  it("injects the reader into the media upload, which checks the size and the two caps", () => {
    const providers = moduleMetadata(MODULE_METADATA.PROVIDERS, MediaModule) as Provider[];
    const injected = injectedTokensOf(providers);

    assert.ok(
      injected.some((tokens) => tokens.includes(OPERATIONAL_SETTINGS_READER)),
      "the upload provider reads the settings",
    );
  });
});
