import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AccessControlGuard } from "./access-control";

/**
 * Registers `AccessControlGuard` for every route of the application. Import it next to the Better
 * Auth registration, whose own global guard must stay disabled (`disableGlobalAuthGuard: true`).
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: AccessControlGuard }],
})
export class AccessControlModule {}
