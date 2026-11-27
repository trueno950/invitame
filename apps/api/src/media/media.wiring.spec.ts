import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module, type Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";
import { INVITATION_GUEST_ALBUM_READER } from "../invitations/application/invitation-guest-album";
import { GetPublicInvitationUseCase } from "../invitations/application/invitation.use-cases";
import { InvitationsModule } from "../invitations/invitations.module";
import { ReadPublicGuestAlbumUseCase } from "./application/guest-album.use-cases";
import { CleanupMediaUseCase, ServeMediaUseCase } from "./application/media.use-cases";
import { MediaModule } from "./media.module";

// The album's required wiring in the application graph (F8; L11.3, L11.4, L11.6, L26). What this suite owns is that no
// consumer of the album can be composed without it: the public read, the media serving route, and the media cleanup all
// take the album as a required dependency, so a deployment that forgot to provide it fails while the application boots
// instead of serving an empty album, answering 404 for every photo, or letting the orphan sweep delete live photos. The
// real modules boot here — `AppModule.forRoot` with a Prisma stub and a local storage directory under the system temp
// directory — and the two behavioral cases drive the resolved use cases through the album adapter the module bound.

const OWNER = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const PHOTO = "44444444-4444-4444-8444-444444444444";
const STORAGE_KEY = `invitations/${INVITATION}/${PHOTO}.webp`;
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

/**
 * The Prisma stub the real adapters read. Its raw queries answer no media row, so serving falls through to the album and
 * the cleanup meets no deleted asset; the album's own reads answer one published photo of a published invitation.
 */
const prismaStub = {
  $queryRaw: async () => [],
  mediaAsset: { findMany: async () => [] },
  guestPhoto: {
    findUnique: async () => ({
      id: PHOTO,
      invitationId: INVITATION,
      storageKey: STORAGE_KEY,
      status: "PUBLISHED",
      uploaderName: null,
      createdAt: CREATED_AT,
      reviewedAt: new Date("2026-01-01T01:00:00.000Z"),
      invitation: { ownerId: OWNER, status: "PUBLISHED" },
    }),
    // The cleanup asks twice: the retired photos (with a `where`) and every storage key the table names (without one).
    findMany: async (args?: { where?: unknown }) =>
      args?.where === undefined ? [{ storageKey: STORAGE_KEY }] : [],
  },
};

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prismaStub }],
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

/** Whether one injected token is the album adapter, either bare or as a `{ token, optional }` descriptor. */
function isGuestAlbumToken(token: unknown): boolean {
  return (
    token === INVITATION_GUEST_ALBUM_READER ||
    (typeof token === "object" &&
      token !== null &&
      (token as { token?: unknown }).token === INVITATION_GUEST_ALBUM_READER)
  );
}

describe("the album's required wiring (F8; L11.3, L11.4, L11.6, L26)", () => {
  let app: INestApplication;
  let directory: string;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "invitame-media-wiring-"));
    app = await createApp(
      AppModule.forRoot({
        environment: {
          NODE_ENV: "test",
          CORS_ORIGIN: "http://localhost:3000",
          // Syntactically valid and never connected: the stub replaces the Prisma client.
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          AUTH_BASE_URL: "http://localhost:3000",
          MEDIA_LOCAL_DIRECTORY: directory,
        },
        database: StubDatabaseModule,
      }),
      { logger: false, abortOnError: false },
    );
    await app.init();

    // One object of a live guest photo, old enough that an unwired sweep would call it an abandoned orphan.
    const path = join(directory, ...STORAGE_KEY.split("/"));
    const ancient = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, new Uint8Array([1, 2, 3]));
    await utimes(path, ancient, ancient);
  });

  after(async () => {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("takes the album as a required dependency of every consumer, with no default to fall back on", () => {
    // A default parameter would stop the arity count at the first one, so these numbers state that the album is not
    // optional: no fallback answers an empty album, a 404, or an unswept table.
    assert.equal(GetPublicInvitationUseCase.length, 3);
    assert.equal(ServeMediaUseCase.length, 3);
    assert.equal(CleanupMediaUseCase.length, 4);
  });

  it("injects the album adapter without the optional flag, so a missing provider fails at startup", () => {
    const providers = [
      ...moduleMetadata(MODULE_METADATA.PROVIDERS, InvitationsModule),
      ...moduleMetadata(MODULE_METADATA.PROVIDERS, MediaModule),
    ] as Provider[];
    const albumInjections = injectedTokensOf(providers).flat().filter(isGuestAlbumToken);

    assert.ok(albumInjections.length > 0, "the public read injects the album adapter");
    assert.deepEqual(
      albumInjections.filter(
        (token) => typeof token === "object" && (token as { optional?: boolean }).optional === true,
      ),
      [],
      "no consumer injects the album adapter as optional",
    );
  });

  it("resolves the public read, the serving route, and the cleanup with the album adapter present", () => {
    const adapter = app.get(INVITATION_GUEST_ALBUM_READER, { strict: false });
    const publicRead = app.get(GetPublicInvitationUseCase, { strict: false });

    assert.ok(adapter instanceof ReadPublicGuestAlbumUseCase);
    assert.ok(publicRead instanceof GetPublicInvitationUseCase);
    // The projection holds the adapter the module bound, not a fallback object.
    assert.equal((publicRead as unknown as { guestAlbum: unknown }).guestAlbum, adapter);
    assert.ok(app.get(ServeMediaUseCase, { strict: false }) instanceof ServeMediaUseCase);
    assert.ok(app.get(CleanupMediaUseCase, { strict: false }) instanceof CleanupMediaUseCase);
  });

  it("serves a published guest photo through the album the module bound", async () => {
    const served = await app
      .get(ServeMediaUseCase, { strict: false })
      .execute(PHOTO, { ownerId: async () => null });

    // Without the album dependency the route would answer the indistinguishable 404 instead of the object.
    assert.equal(served?.cache, "public");
    assert.equal(served?.byteSize, 3);
    const chunks: Buffer[] = [];
    for await (const chunk of served.stream) {
      chunks.push(Buffer.from(chunk));
    }
    assert.deepEqual([...Buffer.concat(chunks)], [1, 2, 3]);
  });

  it("keeps the object of a live guest photo out of the orphan sweep", async () => {
    const result = await app.get(CleanupMediaUseCase, { strict: false }).execute({ dryRun: false });

    // The object is old enough to be an abandoned orphan; only the album's storage keys keep it.
    assert.equal(result.orphanObjects, 0);
    const metadata = await stat(join(directory, ...STORAGE_KEY.split("/")));
    assert.equal(metadata.size, 3);
  });
});
