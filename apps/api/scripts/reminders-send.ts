import { PrismaClient } from "@prisma/client";

import { SendDueRemindersUseCase } from "../src/reminders/application/send-due-reminders.use-case";
import { NotConfiguredReminderSender } from "../src/reminders/infrastructure/not-configured-reminder-sender";
import { PrismaReminderRepository } from "../src/reminders/infrastructure/prisma-reminder.repository";

// `pnpm --filter @invitame/api reminders:send [--dry-run]` (F6; S2.6, S6, L9.4). Sends the WhatsApp reminders due
// today — seven and two days before the RSVP deadline for the guests who have not answered, one day before the
// celebration for the guests expected that day — in each invitation's own time zone, and records every attempt so a
// second run of the same day sends nothing twice.
//
// The command is deliberately not scheduled: this release has no WhatsApp Business subscription, so the only adapter
// is the one that sends nothing and records each attempt as skipped `not_configured` (S6). Turning reminders on is a
// deployment change, not a code change. `--dry-run` plans the run and reports what it would do without claiming,
// sending, or recording anything.
//
// Its report is one JSON line of counts. It never prints a phone number, a guest's name, a message body, an
// invitation id, or an owner: an operator can read the run without seeing personal data.
//
// The public origin the message links name comes from `WHATSAPP_REMINDERS_PUBLIC_BASE_URL`, documented as unset in
// `docs/development/runbooks.md`, with the production origin as its default.

/** The origin the public invitation link names when the deployment states none. */
const DEFAULT_PUBLIC_BASE_URL = "https://invitame.mx";

/** A bare http(s) origin: a scheme, a host, and nothing that could turn into a path, a query, or a fragment. */
const BARE_ORIGIN = /^https?:\/\/[^/?#@\s]+\/?$/i;

/** The origin the message links name, or null when the deployment states one this command cannot trust. */
function publicBaseUrlOf(environment: NodeJS.ProcessEnv): string | null {
  const configured = environment.WHATSAPP_REMINDERS_PUBLIC_BASE_URL?.trim();

  if (configured === undefined || configured === "") {
    return DEFAULT_PUBLIC_BASE_URL;
  }
  return BARE_ORIGIN.test(configured) ? configured.replace(/\/+$/u, "") : null;
}

async function main(): Promise<void> {
  // A package manager forwards arguments after a standalone `--`, so it is dropped before the flags are read.
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const unknown = arguments_.filter((argument) => argument !== "--dry-run");
  if (unknown.length > 0) {
    console.error(JSON.stringify({ event: "reminders_send_refused", reason: "unknown_argument" }));
    process.exitCode = 1;
    return;
  }

  const publicBaseUrl = publicBaseUrlOf(process.env);
  if (publicBaseUrl === null) {
    console.error(JSON.stringify({ event: "reminders_send_refused", reason: "invalid_origin" }));
    process.exitCode = 1;
    return;
  }

  const dryRun = arguments_.includes("--dry-run");
  const prisma = new PrismaClient();

  try {
    const sender = new NotConfiguredReminderSender();
    const run = new SendDueRemindersUseCase(
      new PrismaReminderRepository(prisma),
      sender,
      // The instant is read once, so every invitation of a run judges the same day.
      { publicBaseUrl, now: () => new Date() },
    );
    const report = await run.execute({ dryRun });

    // The capability is reported apart from the counts: it says whether this deployment could send at all (S6).
    console.log(
      JSON.stringify({ event: "reminders_send", configured: sender.isConfigured(), ...report }),
    );
    process.exitCode = report.failed > 0 ? 1 : 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "reminders_send_failed",
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
