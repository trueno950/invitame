import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { InvitationReminders } from "../../invitations/domain/invitation-reminders";
import {
  NOT_CONFIGURED_REASON,
  type ReminderMessage,
  type ReminderSendResult,
  type ReminderSender,
} from "./reminder-sender";
import type {
  ReminderDeliveryClaim,
  ReminderDeliveryKey,
  ReminderGuest,
  ReminderRepository,
  ScheduledReminderInvitation,
} from "./reminder.repository";
import { type ReminderRunReport, SendDueRemindersUseCase } from "./send-due-reminders.use-case";

// The command's use case (F6; S2.6, S6, L9). It plans the reminders due today, asks the sender port once per guest
// and reminder, and records every attempt so a second run sends nothing twice. Every case goes through the public
// entry point with an in-memory port, so what is asserted is the behavior the command has against PostgreSQL.

const PUBLIC_BASE_URL = "https://invitame.mx";
const NOW = new Date("2026-07-25T18:00:00Z");

/** The stored delivery of one attempt, as the in-memory port keeps it. */
interface DeliveryRow extends ReminderDeliveryClaim {
  status: string;
  reason: string | null;
  attemptedAt: Date;
}

class MemoryReminderRepository implements ReminderRepository {
  readonly scheduled: ScheduledReminderInvitation[] = [];
  readonly deliveries: DeliveryRow[] = [];
  listCalls = 0;
  private sequence = 0;

  async listScheduled(): Promise<ScheduledReminderInvitation[]> {
    this.listCalls += 1;

    return this.scheduled.map((invitation) => structuredClone(invitation));
  }

  async hasDelivery(key: ReminderDeliveryKey): Promise<boolean> {
    return this.deliveries.some((row) => sameKey(row, key));
  }

  async claimDelivery(key: ReminderDeliveryKey, at: Date): Promise<ReminderDeliveryClaim | null> {
    if (this.deliveries.some((row) => sameKey(row, key))) {
      return null;
    }
    this.sequence += 1;
    const claim = { ...key, id: `delivery-${this.sequence}` };

    this.deliveries.push({ ...claim, status: "pending", reason: null, attemptedAt: at });
    return claim;
  }

  async recordOutcome(id: string, result: ReminderSendResult): Promise<void> {
    const row = this.deliveries.find((delivery) => delivery.id === id);

    assert.ok(row, "the outcome names a claimed delivery");
    row.status = result.status;
    row.reason =
      result.status === "skipped"
        ? result.reason
        : result.status === "failed"
          ? result.reason
          : null;
  }
}

function sameKey(row: ReminderDeliveryKey, key: ReminderDeliveryKey): boolean {
  return (
    row.invitationId === key.invitationId &&
    row.guestId === key.guestId &&
    row.kind === key.kind &&
    row.dueDate === key.dueDate
  );
}

/** A sender that records what it was asked to send and answers one configured outcome. */
class RecordingReminderSender implements ReminderSender {
  readonly sent: ReminderMessage[] = [];
  configured = true;
  outcome: ReminderSendResult = { status: "sent" };

  isConfigured(): boolean {
    return this.configured;
  }

  async send(message: ReminderMessage): Promise<ReminderSendResult> {
    this.sent.push(message);
    return this.outcome;
  }
}

/** The events one invitation stores: the celebration in September 2026, confirmed at the reception's hour. */
const CONTENT = { date: "2026-09-12", time: "19:30" } as const;

const BOTH_ON: InvitationReminders = { version: 1, pendingRsvp: true, eventEve: true };

function guest(
  id: string,
  phone: string | null,
  attending: boolean | null,
  name = "Familia Gómez",
): ReminderGuest {
  return { id, name, phone, attending };
}

function invitation(
  changes: Partial<ScheduledReminderInvitation> = {},
): ScheduledReminderInvitation {
  return {
    id: "invitation-1",
    slug: "valentina-xv",
    timeZone: "America/Mexico_City",
    content: CONTENT,
    occasion: "XV años",
    reminders: BOTH_ON,
    // The deadline is 2026-08-01 in Mexico City: the seven-day reminder is due on 2026-07-25, the day of `NOW`.
    rsvpDeadline: new Date("2026-08-01T23:00:00Z"),
    includedFeatureKeys: ["WHATSAPP_REMINDERS", "RSVP", "GUEST_LIST"],
    guests: [],
    ...changes,
  };
}

let repository: MemoryReminderRepository;
let sender: RecordingReminderSender;

/** The use case over the in-memory ports; the base URL is the one the message links name. */
function useCase(now: Date = NOW): SendDueRemindersUseCase {
  return new SendDueRemindersUseCase(repository, sender, {
    publicBaseUrl: PUBLIC_BASE_URL,
    now: () => now,
  });
}

beforeEach(() => {
  repository = new MemoryReminderRepository();
  sender = new RecordingReminderSender();
});

describe("the reminders due today (F6; L9.4)", () => {
  it("sends the pending reminder to the guests who have not answered, with the invitation's own link", async () => {
    repository.scheduled.push(
      invitation({
        guests: [
          guest("guest-1", "+525512345678", null, "Familia Gómez"),
          guest("guest-2", "+525587654321", null, "Ana"),
        ],
      }),
    );

    const report = await useCase().execute({ dryRun: false });

    assert.equal(sender.sent.length, 2);
    assert.deepEqual(
      sender.sent.map((message) => message.to),
      ["+525512345678", "+525587654321"],
    );
    assert.equal(
      sender.sent[0]?.body,
      "Hola, Familia Gómez 👋 Te recordamos confirmar tu asistencia. Evento: XV años. Fecha límite: 1 de agosto. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
    assert.equal(
      sender.sent[1]?.body,
      "Hola, Ana 👋 Te recordamos confirmar tu asistencia. Evento: XV años. Fecha límite: 1 de agosto. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
    assert.deepEqual(
      { due: report.due, sent: report.sent, skipped: report.skipped, failed: report.failed },
      { due: 2, sent: 2, skipped: 0, failed: 0 },
    );
  });

  it("never writes to a guest who already answered or who has no phone, and counts the unreachable ones", async () => {
    repository.scheduled.push(
      invitation({
        guests: [
          guest("guest-1", "+525512345678", null),
          // An answer of any kind takes the guest out of the deadline reminder.
          guest("guest-2", "+525587654321", true),
          guest("guest-3", "+525511112222", false),
          // A guest without a phone is listed as not reachable instead of being reminded.
          guest("guest-4", null, null),
        ],
      }),
    );

    const report = await useCase().execute({ dryRun: false });

    assert.deepEqual(
      sender.sent.map((message) => message.to),
      ["+525512345678"],
    );
    assert.equal(report.due, 1);
    assert.equal(report.unreachable, 1);
  });

  it("sends the event reminder the day before the celebration, to the guests who did not decline", async () => {
    repository.scheduled.push(
      invitation({
        rsvpDeadline: null,
        guests: [
          guest("guest-1", "+525512345678", true, "Familia Gómez"),
          guest("guest-2", "+525587654321", null, "Ana"),
          guest("guest-3", "+525511112222", false, "Luis"),
        ],
      }),
    );

    const report = await useCase(new Date("2026-09-11T18:00:00Z")).execute({ dryRun: false });

    assert.deepEqual(
      sender.sent.map((message) => message.body),
      [
        "Hola, Familia Gómez 👋 Te esperamos mañana. Evento: XV años. Hora: 19:30 h. Tu invitación: https://invitame.mx/i/valentina-xv",
        "Hola, Ana 👋 Te esperamos mañana. Evento: XV años. Hora: 19:30 h. Tu invitación: https://invitame.mx/i/valentina-xv",
      ],
    );
    assert.equal(report.due, 2);
    assert.equal(report.sent, 2);
  });

  it("sends nothing for an invitation whose package does not grant reminders", async () => {
    repository.scheduled.push(
      invitation({
        includedFeatureKeys: ["RSVP", "GUEST_LIST"],
        guests: [guest("guest-1", "+525512345678", null)],
      }),
    );

    const report = await useCase().execute({ dryRun: false });

    assert.equal(sender.sent.length, 0);
    assert.equal(report.due, 0);
    assert.equal(report.notGranted, 1);
  });

  it("sends nothing on any other day, and nothing for a reminder the owner switched off", async () => {
    repository.scheduled.push(
      invitation({ guests: [guest("guest-1", "+525512345678", null)] }),
      invitation({
        id: "invitation-2",
        reminders: { version: 1, pendingRsvp: false, eventEve: true },
        guests: [guest("guest-2", "+525587654321", null)],
      }),
    );

    const later = await useCase(new Date("2026-07-26T18:00:00Z")).execute({ dryRun: false });

    assert.equal(sender.sent.length, 0);
    assert.equal(later.due, 0);
    assert.equal(later.notGranted, 0);
  });

  it("reports an invitation whose stored zone cannot be read instead of sending at the wrong hour", async () => {
    repository.scheduled.push(
      invitation({
        timeZone: "America/Nowhere",
        guests: [guest("guest-1", "+525512345678", null)],
      }),
    );

    const report = await useCase().execute({ dryRun: false });

    assert.equal(sender.sent.length, 0);
    assert.equal(report.unusable, 1);
  });
});

describe("one attempt per reminder (F6; L9.4)", () => {
  it("records the attempt and sends nothing twice on a second run", async () => {
    repository.scheduled.push(
      invitation({
        guests: [guest("guest-1", "+525512345678", null), guest("guest-2", "+525587654321", null)],
      }),
    );

    const first = await useCase().execute({ dryRun: false });
    const second = await useCase().execute({ dryRun: false });

    assert.deepEqual({ due: first.due, sent: first.sent }, { due: 2, sent: 2 });
    assert.equal(sender.sent.length, 2);
    assert.deepEqual(
      { due: second.due, sent: second.sent, alreadyRecorded: second.alreadyRecorded },
      { due: 2, sent: 0, alreadyRecorded: 2 },
    );
    assert.deepEqual(
      repository.deliveries.map((row) => [row.kind, row.dueDate, row.status]),
      [
        ["PENDING_RSVP_7D", "2026-07-25", "sent"],
        ["PENDING_RSVP_7D", "2026-07-25", "sent"],
      ],
    );
  });

  it("records the default adapter's skipped attempt as not configured", async () => {
    repository.scheduled.push(invitation({ guests: [guest("guest-1", "+525512345678", null)] }));
    sender.configured = false;
    sender.outcome = { status: "skipped", reason: NOT_CONFIGURED_REASON };

    const report = await useCase().execute({ dryRun: false });

    assert.deepEqual(
      { sent: report.sent, skipped: report.skipped, failed: report.failed },
      { sent: 0, skipped: 1, failed: 0 },
    );
    assert.deepEqual(
      repository.deliveries.map((row) => [row.status, row.reason]),
      [["skipped", "not_configured"]],
    );
  });

  it("records a provider refusal as failed, with its stable reason, and sends nothing the second time", async () => {
    repository.scheduled.push(
      invitation({
        guests: [guest("guest-1", "+525512345678", null), guest("guest-2", "+525587654321", null)],
      }),
    );
    sender.outcome = { status: "failed", reason: "provider_unavailable" };

    const report = await useCase().execute({ dryRun: false });
    const second = await useCase().execute({ dryRun: false });

    assert.equal(report.failed, 2);
    assert.deepEqual(
      repository.deliveries.slice(0, 1).map((row) => [row.status, row.reason]),
      [["failed", "provider_unavailable"]],
    );
    // A failed attempt is still an attempt: a rerun of the same day does not reload the guest's phone.
    assert.equal(second.failed, 0);
    assert.equal(second.alreadyRecorded, 2);
    assert.equal(sender.sent.length, 2);
  });

  it("records a sender that throws as a failed attempt instead of stopping the run", async () => {
    repository.scheduled.push(
      invitation({
        guests: [guest("guest-1", "+525512345678", null), guest("guest-2", "+525587654321", null)],
      }),
    );
    sender.send = async (message) => {
      sender.sent.push(message);
      throw new Error("the provider dropped the connection");
    };

    const report = await useCase().execute({ dryRun: false });

    assert.equal(report.failed, 2);
    assert.deepEqual(
      repository.deliveries.map((row) => row.status),
      ["failed", "failed"],
    );
  });
});

describe("the dry run (F6; L9.4)", () => {
  it("sends nothing and records nothing, and still reports the plan", async () => {
    repository.scheduled.push(
      invitation({
        guests: [guest("guest-1", "+525512345678", null), guest("guest-2", null, null)],
      }),
    );

    const report: ReminderRunReport = await useCase().execute({ dryRun: true });

    assert.deepEqual(
      { mode: report.mode, invitations: report.invitations, due: report.due, sent: report.sent },
      { mode: "dry-run", invitations: 1, due: 1, sent: 0 },
    );
    assert.equal(report.unreachable, 1);
    assert.equal(report.skipped, 0);
    assert.equal(sender.sent.length, 0);
    assert.deepEqual(repository.deliveries, []);
  });

  it("reports what a second run would already have recorded", async () => {
    repository.scheduled.push(invitation({ guests: [guest("guest-1", "+525512345678", null)] }));
    await useCase().execute({ dryRun: false });

    const report = await useCase().execute({ dryRun: true });

    assert.deepEqual(
      { due: report.due, alreadyRecorded: report.alreadyRecorded, sent: report.sent },
      { due: 1, alreadyRecorded: 1, sent: 0 },
    );
    assert.equal(sender.sent.length, 1);
  });

  it("touches no phone and no name in its report", async () => {
    repository.scheduled.push(invitation({ guests: [guest("guest-1", "+525512345678", null)] }));

    const report = await useCase().execute({ dryRun: false });
    const printed = JSON.stringify(report);

    assert.equal(printed.includes("+525512345678"), false);
    assert.equal(printed.includes("Familia Gómez"), false);
  });
});
