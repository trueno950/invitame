import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Param, Req, Res, StreamableFile } from "@nestjs/common";
import { AuthService } from "@thallesp/nestjs-better-auth";

import { Public } from "../../auth/access-control/access-control";
import { ServeMediaUseCase } from "../application/media.use-cases";
import { mapMediaError, mediaNotFound } from "./media.response";
import { optionalSessionUserId } from "./optional-session";

/** The response object the serving route sets headers on; the Express reply satisfies it. */
interface StreamReply {
  setHeader(name: string, value: string): void;
}

/** The long, immutable cache of a published image: it never changes under one asset id (S4). */
const PUBLIC_CACHE = "public, max-age=31536000, immutable";
/** The owner's view of an unpublished image: never cached anywhere (S4). */
const PRIVATE_CACHE = "private, no-store";

/**
 * The one public media route (M8 S4). `@Public()` is deliberate: a guest has no session, so the global guard must not
 * even read one, and the route stays up when the auth store does not. The asset id alone is the input; the use case
 * decides from the invitation: a published invitation's image is public and immutably cached for a year, the owner
 * sees a draft with `private, no-store`, and every other case — missing, deleted, unpublished, foreign, or an object
 * that is gone — answers the same 404, so the route never confirms that an asset exists (A4).
 *
 * Headers: `Content-Type: image/webp` because every stored object is the API's own WebP, `X-Content-Type-Options:
 * nosniff` so a browser never guesses another type, `Content-Disposition: inline` so the image renders in place, and
 * `Cross-Origin-Resource-Policy: cross-origin` because the web app on another origin embeds it (helmet's same-origin
 * default would block it). No URL or header ever names the storage provider.
 */
@Controller("media")
@Public()
export class MediaController {
  constructor(
    @Inject(ServeMediaUseCase) private readonly serve: ServeMediaUseCase,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get(":assetId")
  async read(
    @Param("assetId") assetId: string,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) reply: StreamReply,
  ): Promise<StreamableFile> {
    try {
      const served = await this.serve.execute(assetId, {
        ownerId: () => optionalSessionUserId(this.auth, request),
      });
      if (served === null) {
        throw mediaNotFound();
      }

      reply.setHeader("Content-Type", "image/webp");
      reply.setHeader("X-Content-Type-Options", "nosniff");
      reply.setHeader("Content-Disposition", "inline");
      reply.setHeader("Content-Length", String(served.byteSize));
      reply.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      reply.setHeader("Cache-Control", served.cache === "public" ? PUBLIC_CACHE : PRIVATE_CACHE);

      return new StreamableFile(served.stream);
    } catch (error) {
      return mapMediaError(error);
    }
  }
}
