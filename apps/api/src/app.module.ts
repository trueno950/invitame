import { type DynamicModule, Module, type Type } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AccessControlModule } from "./auth/access-control/access-control.module";
import { registerAuthModule } from "./auth/auth.registration";
import { CatalogModule } from "./catalog/catalog.module";
import { createConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { EmailModule } from "./email/email.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { PaymentsModule } from "./payments/payments.module";
import { SettingsModule } from "./settings/settings.module";
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
        AdminModule,
        EmailModule,
        HealthModule,
        UsersModule,
        CatalogModule,
        // The administrator's operational settings (M9 T13; S5, S8): it owns the single-row table, exports the one read
        // contract the invitations and media modules consume, and serves `/admin/settings`. It imports the admin
        // module for the audit recorder and nothing imports it back.
        SettingsModule,
        InvitationsModule,
        PaymentsModule,
      ],
    };
  }
}
