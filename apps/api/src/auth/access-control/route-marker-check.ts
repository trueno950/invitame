import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";

import { findUnsupportedMarker, unsupportedMarkerMessage } from "./access-control";

/**
 * Refuses to start an application in which any registered controller or handler carries a marker of
 * the Better Auth integration (`@AllowAnonymous()`, `@Roles()`, and the rest of
 * `UNSUPPORTED_INTEGRATION_KEYS`). The project guard honors none of them, so such a route would look
 * public or restricted while it is not (L27). Runs during `app.init()`, which `listen()` calls, so a
 * misdecorated route fails at startup instead of on its first request.
 */
@Injectable()
export class RouteMarkerCheck implements OnModuleInit {
  private readonly logger = new Logger(RouteMarkerCheck.name);

  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getControllers()) {
      const controller = wrapper.metatype;
      if (typeof controller !== "function") {
        continue;
      }

      const prototype = controller.prototype as Record<string, unknown>;
      for (const handler of this.scanner.getAllMethodNames(prototype)) {
        const method = prototype[handler];
        if (typeof method !== "function") {
          continue;
        }

        const marker = findUnsupportedMarker(this.reflector, method, controller);
        if (marker) {
          const message = unsupportedMarkerMessage(`${controller.name}.${handler}`, marker);
          // The bootstrap prints a generic failure only; class and handler names are not secrets.
          this.logger.error(message);
          throw new Error(message);
        }
      }
    }
  }
}
