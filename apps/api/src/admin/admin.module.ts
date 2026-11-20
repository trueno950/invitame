import { Module } from "@nestjs/common";

import { ADMIN_ACTION_RECORDER, type AdminActionRecorder } from "./admin-action-recorder";
import { PrismaAdminActionRecorder } from "./infrastructure/prisma-admin-action-recorder";

/**
 * Administrator operations (M9 T6; S4, S6, L9). This slice is the audit foundation and nothing else yet: it owns the
 * `AdminAction` table and exports the one public contract another module needs, `AdminActionRecorder`. Because
 * `record(tx, entry)` takes the caller's Prisma transaction client, the module that owns a change writes its own row
 * and the audit row in one transaction (L9 «Misma transacción»); the recorder never opens a transaction of its own and
 * holds no client. No other code writes `AdminAction`: the table belongs to this module, this provider is its only
 * door, and the migration's trigger refuses every later UPDATE and DELETE.
 *
 * The routes that call it — unpublish an invitation, disable or reactivate an account, resend the sign-in code —
 * arrive in later tasks and belong to the module that owns the changed state, which injects `ADMIN_ACTION_RECORDER`.
 */
@Module({
  providers: [
    {
      provide: ADMIN_ACTION_RECORDER,
      useFactory: (): AdminActionRecorder => new PrismaAdminActionRecorder(),
    },
  ],
  exports: [ADMIN_ACTION_RECORDER],
})
export class AdminModule {}
