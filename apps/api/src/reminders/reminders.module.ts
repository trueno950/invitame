import { Module } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { REMINDER_REPOSITORY } from "./application/reminder.repository";
import { REMINDER_SENDER, type ReminderSender } from "./application/reminder-sender";
import { NotConfiguredReminderSender } from "./infrastructure/not-configured-reminder-sender";
import { PrismaReminderRepository } from "./infrastructure/prisma-reminder.repository";

/**
 * The WhatsApp reminders (F6; S2.6, S6, L9). Two things leave this module and nothing imports it back:
 *
 * - `REMINDER_REPOSITORY` and `REMINDER_SENDER`, the ports the `reminders:send` command composes directly, so the
 *   command runs without booting the HTTP application;
 * - `REMINDER_SENDER` again for the invitations module, which reads only its capability: the owner's editor shows
 *   «Aún no está activo» while no provider is configured (L9.5), and never a secret.
 *
 * The only adapter of this release is the one that sends nothing and reports `not_configured` (S6): a WhatsApp
 * Business adapter needs a paid subscription, and replacing this line with one is the whole activation.
 */
@Module({
  providers: [
    {
      provide: REMINDER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaReminderRepository(prisma),
      inject: [PrismaService],
    },
    {
      // The default adapter: it holds no state and reads no configuration, so its absence is what makes reminders
      // «Aún no está activo» (S6). A later adapter reads the Business keys the runbook documents as unset.
      provide: REMINDER_SENDER,
      useFactory: (): ReminderSender => new NotConfiguredReminderSender(),
      inject: [],
    },
  ],
  exports: [REMINDER_REPOSITORY, REMINDER_SENDER],
})
export class RemindersModule {}
