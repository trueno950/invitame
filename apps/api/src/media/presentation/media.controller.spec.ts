import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { HttpException, NotFoundException, StreamableFile } from "@nestjs/common";
import type { AuthService } from "@thallesp/nestjs-better-auth";
import { InvitationNotEditableError } from "../../invitations/domain/invitation.errors";
import {
  GalleryNotAvailableError,
  InvalidMediaUploadError,
  MediaLimitExceededError,
  MediaNotFoundError,
} from "../application/media.errors";
import type {
  MediaAssetView,
  ServedMedia,
  ServeMediaUseCase,
  UpdateMediaUseCase,
  UploadMediaUseCase,
} from "../application/media.use-cases";
import { MediaStorageError } from "../application/media-storage";
import { MAX_UPLOAD_REQUEST_BYTES } from "../domain/media-asset";
import { InvitationsMediaController } from "./invitations-media.controller";
import { MediaController } from "./media.controller";

// The media REST boundary (M8 S4): the multipart upload, its size bound and unknown fields, the owner routes, and
// the serving headers. The controller is instantiated directly, so each case observes exactly what Nest would
// answer and what reached the use cases; no database and no provider is involved.

const OWNER = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const ASSET = "44444444-4444-4444-8444-444444444444";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const BOUNDARY = "----invitameTestBoundary";

function multipart(
  parts: Array<{
    name: string;
    value?: string;
    filename?: string;
    contentType?: string;
    bytes?: Buffer;
  }>,
): {
  body: Buffer;
  contentType: string;
} {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const filename = part.filename === undefined ? "" : `; filename="${part.filename}"`;
    const contentType =
      part.contentType === undefined ? "" : `\r\nContent-Type: ${part.contentType}`;
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"${filename}${contentType}\r\n\r\n`,
      ),
    );
    chunks.push(part.bytes ?? Buffer.from(part.value ?? ""));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

function request(
  body: Buffer,
  contentType: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  const stream = Readable.from(body) as unknown as IncomingMessage;
  Object.assign(stream, { headers: { "content-type": contentType, ...headers } });
  return stream;
}

function view(overrides: Partial<MediaAssetView> = {}): MediaAssetView {
  return {
    id: ASSET,
    kind: "gallery",
    url: `https://api.example.test/media/${ASSET}`,
    width: 2000,
    height: 1500,
    alt: null,
    position: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function controllerWith(options: { uploadError?: Error } = {}) {
  const captured: Array<Record<string, unknown>> = [];
  const upload = {
    execute: async (input: Record<string, unknown>) => {
      if (options.uploadError) {
        throw options.uploadError;
      }
      captured.push(input);
      return view({
        kind: input.kind as "gallery" | "main-photo",
        alt: (input.alt as string) ?? null,
      });
    },
  } as unknown as UploadMediaUseCase;
  const list = { execute: async () => [view()] } as never;
  const update = {
    execute: async (input: Record<string, unknown>) => view({ alt: (input.alt as string) ?? null }),
  } as unknown as UpdateMediaUseCase;
  const deleteMedia = { execute: async () => undefined } as never;

  return {
    controller: new InvitationsMediaController(upload, list, update, deleteMedia),
    captured,
  };
}

describe("POST /invitations/:id/media", () => {
  it("accepts a multipart file, kind, and alt, and answers the asset view", async () => {
    const { controller, captured } = controllerWith();
    const form = multipart([
      { name: "kind", value: "gallery" },
      { name: "alt", value: "Entrada" },
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes: JPEG },
    ]);

    const response = await controller.create(
      OWNER,
      INVITATION,
      request(form.body, form.contentType),
    );

    assert.equal(response.id, ASSET);
    assert.equal(response.url, `https://api.example.test/media/${ASSET}`);
    assert.equal(response.createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(captured[0]?.ownerId, OWNER);
    assert.equal(captured[0]?.invitationId, INVITATION);
    assert.equal(captured[0]?.kind, "gallery");
    assert.equal(captured[0]?.alt, "Entrada");
    assert.deepEqual(Buffer.from(captured[0]?.bytes as Uint8Array), JPEG);
  });

  it("ignores the client's filename and MIME: the use case decides from the bytes", async () => {
    const { controller, captured } = controllerWith();
    const form = multipart([
      { name: "kind", value: "main-photo" },
      { name: "file", filename: "photo.exe", contentType: "application/octet-stream", bytes: JPEG },
    ]);

    await controller.create(OWNER, INVITATION, request(form.body, form.contentType));

    assert.equal(captured[0]?.kind, "main-photo");
    assert.equal(captured[0]?.alt, null);
  });

  it("refuses an unknown multipart field and a missing file", async () => {
    const { controller, captured } = controllerWith();

    const unknown = multipart([
      { name: "kind", value: "gallery" },
      { name: "position", value: "3" },
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes: JPEG },
    ]);
    await assert.rejects(
      controller.create(OWNER, INVITATION, request(unknown.body, unknown.contentType)),
      (error: unknown) =>
        httpCode(error) === 400 && httpBody(error).code === "INVALID_MEDIA_UPLOAD",
    );

    const missing = multipart([{ name: "kind", value: "gallery" }]);
    await assert.rejects(
      controller.create(OWNER, INVITATION, request(missing.body, missing.contentType)),
      (error: unknown) =>
        httpCode(error) === 400 && httpBody(error).code === "INVALID_MEDIA_UPLOAD",
    );
    assert.deepEqual(captured, []);
  });

  it("refuses a body over the route's 11 MB limit with 413, before parsing it", async () => {
    const { controller, captured } = controllerWith();
    const form = multipart([
      { name: "kind", value: "gallery" },
      {
        name: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        bytes: Buffer.alloc(MAX_UPLOAD_REQUEST_BYTES + 1),
      },
    ]);

    await assert.rejects(
      controller.create(OWNER, INVITATION, request(form.body, form.contentType)),
      (error: unknown) => httpCode(error) === 413 && httpBody(error).code === "PAYLOAD_TOO_LARGE",
    );
    assert.deepEqual(captured, []);
  });

  it("refuses a request that is not multipart with 415", async () => {
    const { controller } = controllerWith();
    const stream = request(JPEG, "application/json");

    await assert.rejects(
      controller.create(OWNER, INVITATION, stream),
      (error: unknown) => httpCode(error) === 415,
    );
  });

  it("maps a refused upload, a missing invitation, an archived one, and a limit to their own answers", async () => {
    const cases: Array<[Error, number, string]> = [
      [
        new InvalidMediaUploadError(["file must be a JPEG, PNG, or WebP image"]),
        400,
        "INVALID_MEDIA_UPLOAD",
      ],
      [new MediaNotFoundError(), 404, "MEDIA_NOT_FOUND"],
      [new InvitationNotEditableError("ARCHIVED"), 409, "INVITATION_NOT_EDITABLE"],
      [new GalleryNotAvailableError(), 409, "GALLERY_NOT_AVAILABLE"],
      [new MediaLimitExceededError("gallery"), 409, "MEDIA_LIMIT_REACHED"],
      [new MediaStorageError("put"), 503, "MEDIA_STORAGE_UNAVAILABLE"],
    ];

    for (const [error, status, code] of cases) {
      const { controller } = controllerWith({ uploadError: error });
      const form = multipart([
        { name: "kind", value: "gallery" },
        { name: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes: JPEG },
      ]);

      await assert.rejects(
        controller.create(OWNER, INVITATION, request(form.body, form.contentType)),
        (thrown: unknown) => httpCode(thrown) === status && httpBody(thrown).code === code,
        `${code}: ${error.message}`,
      );
    }
  });
});

describe("owner media routes", () => {
  it("lists the stored assets", async () => {
    const { controller } = controllerWith();
    assert.equal((await controller.list(OWNER, INVITATION)).length, 1);
  });

  it("answers the same 404 for a foreign, missing, or deleted asset", async () => {
    const update = {
      execute: async () => {
        throw new MediaNotFoundError();
      },
    } as unknown as UpdateMediaUseCase;
    const deleteMedia = {
      execute: async () => {
        throw new MediaNotFoundError();
      },
    } as never;
    const controller = new InvitationsMediaController(
      {} as UploadMediaUseCase,
      {} as never,
      update,
      deleteMedia,
    );

    for (const call of [
      () => controller.update(OWNER, INVITATION, ASSET, { alt: "x" }),
      () => controller.remove(OWNER, INVITATION, ASSET),
    ]) {
      await assert.rejects(call(), (error: unknown) => {
        assert.equal(httpCode(error), 404);
        assert.deepEqual(httpBody(error), { code: "MEDIA_NOT_FOUND", message: "Media not found." });
        return true;
      });
    }
  });

  it("answers 200 with the deleted marker", async () => {
    const { controller } = controllerWith();
    assert.deepEqual(await controller.remove(OWNER, INVITATION, ASSET), { status: "deleted" });
  });
});

describe("GET /media/:assetId", () => {
  function reply() {
    const headers = new Map<string, string>();
    return {
      headers,
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
    };
  }

  function auth(authorisedOwner: string | null): AuthService {
    return {
      api: {
        getSession: async () =>
          authorisedOwner === null
            ? null
            : {
                user: {
                  id: authorisedOwner,
                  status: "ACTIVE",
                  role: "CUSTOMER",
                  twoFactorEnabled: false,
                },
                session: { secondFactorVerified: true },
              },
      },
    } as unknown as AuthService;
  }

  function served(cache: "public" | "private"): ServedMedia {
    return {
      stream: Readable.from(Buffer.from("image")),
      byteSize: 5,
      cache,
    };
  }

  it("serves a published image with the immutable cache and the image headers", async () => {
    const serve = {
      execute: async (_id: string, requester: { ownerId: () => Promise<string | null> }) => {
        await requester.ownerId();
        return served("public");
      },
    } as unknown as ServeMediaUseCase;
    const controller = new MediaController(serve, auth(OWNER));
    const headers = reply();

    const file = await controller.read(ASSET, request(Buffer.alloc(0), "image/webp"), headers);

    assert.ok(file instanceof StreamableFile);
    assert.equal(headers.headers.get("content-type"), "image/webp");
    assert.equal(headers.headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.headers.get("content-disposition"), "inline");
    assert.equal(headers.headers.get("content-length"), "5");
    assert.equal(headers.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(headers.headers.get("cross-origin-resource-policy"), "cross-origin");
  });

  it("serves the owner's unpublished image with private, no-store", async () => {
    const serve = { execute: async () => served("private") } as unknown as ServeMediaUseCase;
    const controller = new MediaController(serve, auth(OWNER));
    const headers = reply();

    await controller.read(ASSET, request(Buffer.alloc(0), "image/webp"), headers);

    assert.equal(headers.headers.get("cache-control"), "private, no-store");
    assert.equal(headers.headers.get("content-type"), "image/webp");
  });

  it("answers one indistinguishable 404 for every invisible case", async () => {
    const serve = { execute: async () => null } as unknown as ServeMediaUseCase;

    for (const assetId of [ASSET, "not-a-uuid", randomUUID()]) {
      const controller = new MediaController(serve, auth(null));
      await assert.rejects(
        controller.read(assetId, request(Buffer.alloc(0), "image/webp"), reply()),
        (error: unknown) => {
          assert.ok(error instanceof NotFoundException);
          assert.deepEqual(httpBody(error), {
            code: "MEDIA_NOT_FOUND",
            message: "Media not found.",
          });
          return true;
        },
      );
    }
  });

  it("ignores a broken session store for a published image, so a public read never depends on auth", async () => {
    const serve = { execute: async () => served("public") } as unknown as ServeMediaUseCase;
    const broken = {
      api: {
        getSession: async () => {
          throw new Error("session store unavailable");
        },
      },
    } as unknown as AuthService;
    const controller = new MediaController(serve, broken);

    const headers = reply();
    assert.ok(
      (await controller.read(ASSET, request(Buffer.alloc(0), "image/webp"), headers)) instanceof
        StreamableFile,
    );
    assert.equal(headers.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

function httpCode(error: unknown): number {
  return error instanceof HttpException ? error.getStatus() : 0;
}

function httpBody(error: unknown): { code: string; message: string } {
  const response = error instanceof HttpException ? error.getResponse() : {};
  return response as { code: string; message: string };
}
