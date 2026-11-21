import { Module } from "@nestjs/common";

import { ADMIN_ACTION_RECORDER, type AdminActionRecorder } from "../admin/admin-action-recorder";
import { AdminModule } from "../admin/admin.module";
import { PrismaService } from "../database/prisma.service";
import {
  OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "./application/operational-settings";
import {
  OPERATIONAL_SETTINGS_REPOSITORY,
  type OperationalSettingsRepository,
} from "./application/operational-settings.repository";
import {
  GetOperationalSettingsUseCase,
  UpdateOperationalSettingsUseCase,
} from "./application/operational-settings.use-cases";
import { PrismaOperationalSettingsRepository } from "./infrastructure/prisma-operational-settings.repository";
import { AdminSettingsController } from "./presentation/admin-settings.controller";

/**
 * The administrator's operational settings (M9 T13; S5, S8, L15). This module owns the single-row `OperationalSettings`
 * table and two things leave it:
 *
 * - `OPERATIONAL_SETTINGS_READER.current()`, the one public read contract. The invitations module (the RSVP limits, the
 *   place search, the analytics default window) and the media module (the gallery cap, the stored-asset cap, the upload
 *   size) inject it and read the row at the moment they check a limit — no cache, so a save takes effect on the next
 *   check — and neither module queries this table.
 * - the two administrator routes, `GET` and `PUT /admin/settings`.
 *
 * The save is one transaction over this module's row and the `admin` module's audit table: this module imports
 * `AdminModule` for its one public `AdminActionRecorder`, and nothing imports it back, so the graph stays acyclic. The
 * same Prisma adapter answers both tokens: a reader reads the row, a save locks it, updates it, and asks the recorder
 * for the audit row on the same transaction client.
 */
@Module({
  imports: [AdminModule],
  controllers: [AdminSettingsController],
  providers: [
    {
      provide: PrismaOperationalSettingsRepository,
      useFactory: (prisma: PrismaService, actions: AdminActionRecorder) =>
        new PrismaOperationalSettingsRepository(prisma, actions),
      inject: [PrismaService, ADMIN_ACTION_RECORDER],
    },
    {
      provide: OPERATIONAL_SETTINGS_REPOSITORY,
      useExisting: PrismaOperationalSettingsRepository,
    },
    {
      // The reader is the same adapter: one row, one read path, and no second place that knows the row's id.
      provide: OPERATIONAL_SETTINGS_READER,
      useExisting: PrismaOperationalSettingsRepository,
    },
    {
      provide: GetOperationalSettingsUseCase,
      useFactory: (settings: OperationalSettingsRepository) =>
        new GetOperationalSettingsUseCase(settings),
      inject: [OPERATIONAL_SETTINGS_REPOSITORY],
    },
    {
      provide: UpdateOperationalSettingsUseCase,
      useFactory: (settings: OperationalSettingsRepository) =>
        new UpdateOperationalSettingsUseCase(settings),
      inject: [OPERATIONAL_SETTINGS_REPOSITORY],
    },
  ],
  exports: [OPERATIONAL_SETTINGS_READER],
})
export class SettingsModule {}

/** The read contract the module exports, re-exported so a consumer imports one public file. */
export type { OperationalSettingsReader };
