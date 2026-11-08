import { Module } from "@nestjs/common";
import { APP_GUARD, DiscoveryModule } from "@nestjs/core";

import { AccessControlGuard } from "./access-control";
import { RouteMarkerCheck } from "./route-marker-check";

/**
 * Registers `AccessControlGuard` for every route of the application, and `RouteMarkerCheck`, which
 * refuses to start an app whose routes carry the integration's own markers. Import it next to the
 * Better Auth registration, whose own global guard must stay disabled (`disableGlobalAuthGuard: true`).
 */
@Module({
  imports: [DiscoveryModule],
  providers: [{ provide: APP_GUARD, useClass: AccessControlGuard }, RouteMarkerCheck],
})
export class AccessControlModule {}
