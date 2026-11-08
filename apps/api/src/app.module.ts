import { type DynamicModule, Module, type Type } from "@nestjs/common";

import { AccessControlModule } from "./auth/access-control/access-control.module";
import { registerAuthModule } from "./auth/auth.registration";
import { createConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { EmailModule } from "./email/email.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";

export interface AppModuleOptions {
  /**
   * Explicit environment validated like the runtime one. When omitted, the API reads `process.env`
   * and `apps/api/.env`; tests pass a record so they never read local configuration.
   */
  environment?: Record<string, unknown>;
  /**
   * Global module that exports `PrismaService`. Defaults to `PrismaModule`; tests substitute a stub
   * so no Prisma client is constructed.
   */
  database?: Type<unknown> | DynamicModule;
}

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose `forRoot` on the module class.
export class AppModule {
  static forRoot(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        createConfigModule(options.environment),
        options.database ?? PrismaModule,
        registerAuthModule(),
        AccessControlModule,
        EmailModule,
        HealthModule,
        UsersModule,
      ],
    };
  }
}
