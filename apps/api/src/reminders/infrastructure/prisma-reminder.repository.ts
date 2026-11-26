import { Prisma, type PrismaClient } from "@prisma/client";

import { storedReminders } from "../../invitations/domain/invitation-reminders";
import type {
  ReminderDeliveryClaim,
  ReminderDeliveryKey,
  ReminderGuest,
  ReminderRepository,
  ScheduledReminderInvitation,
} from "../application/reminder.repository";
import type { ReminderSendResult } from "../application/reminder-sender";

/**
 * The reminder port on PostgreSQL (F6; S2.6, S6, L9.3, L9.4). Three statements make a run: one read of the invitations
 * the owner switched a reminder on, the unique insert that claims one attempt, and the update that records its
 * outcome. The unique index — invitation, guest, kind, day — is the only guard of "one reminder per attempt", so two
 * runs of the same day converge on one row instead of sending twice (L9.4).
 *
 * The read answers only what a reminder needs: the released page, the invitation's own zone, the content the
 * celebration's day and hour come from, the occasion its category names, the stored switches, the deadline, the keys
 * of the pinned package, and the guests of the list with their answer. Nothing of it is logged, and no phone leaves
 * this module except into the sender port.
 */

/** The most characters the reason column holds; a sender's longer reason is cut instead of failing the update. */
const REASON_MAX_LENGTH = 40;

const SCHEDULED_SELECT = {
  id: true,
  slug: true,
  timeZone: true,
  content: true,
  rsvpDeadline: true,
  featureSettings: { select: { reminders: true } },
  // The pinned package's keys are what grants the capability (L9.2): they travel with the row, so the use case gates
  // without a second read and without a package name.
  package: {
    select: {
      packageFeatures: { select: { included: true, feature: { select: { key: true } } } },
    },
  },
  // The occasion the message names is the category of the template the invitation is pinned to, which is the
  // invitation's own data and not a package name.
  templateVersion: {
    select: { template: { select: { category: { select: { name: true } } } } },
  },
  guests: {
    select: {
      id: true,
      name: true,
      phone: true,
      rsvpResponse: { select: { attending: true } },
    },
  },
} satisfies Prisma.InvitationSelect;

type ScheduledRow = Prisma.InvitationGetPayload<{ select: typeof SCHEDULED_SELECT }>;

/** The guests of one row: only a stored phone can be reminded, and no answer reads as "has not answered yet". */
function toGuests(rows: ScheduledRow["guests"]): ReminderGuest[] {
  return rows.map((guest) => ({
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    attending: guest.rsvpResponse?.attending ?? null,
  }));
}

/** The catalog keys the pinned package grants, in the catalog's own order. */
function toIncludedFeatureKeys(row: ScheduledRow): string[] {
  return row.package.packageFeatures
    .filter((link) => link.included)
    .map((link) => link.feature.key);
}

/** The row as the use case reads it, or null when its stored switches are not a payload the rules accept (L9.1). */
function toScheduled(row: ScheduledRow): ScheduledReminderInvitation | null {
  const reminders = storedReminders(row.featureSettings?.reminders);

  if (reminders === null) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    timeZone: row.timeZone,
    content: row.content,
    occasion: row.templateVersion.template.category.name,
    reminders,
    rsvpDeadline: row.rsvpDeadline,
    includedFeatureKeys: toIncludedFeatureKeys(row),
    guests: toGuests(row.guests),
  };
}

/** One calendar day as the DATE column stores it: midnight UTC of that day, never an instant of another zone. */
function dueDateColumn(dueDate: string): Date {
  return new Date(`${dueDate}T00:00:00.000Z`);
}

/** A sender's reason, bounded to the column and stripped of anything that is not a stable key of visible ASCII. */
function reasonColumn(reason: string): string {
  const normalized = reason
    .replace(/[^\w.-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, REASON_MAX_LENGTH);

  return normalized === "" ? "unknown" : normalized;
}

/** Whether two unique columns already hold a row, which is what a lost claim race answers with. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class PrismaReminderRepository implements ReminderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listScheduled(now: Date): Promise<ScheduledReminderInvitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: {
        status: "PUBLISHED",
        archivedAt: null,
        // An expired invitation stays visible read-only and accepts no answers, so nothing is due for it (S2, T3).
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        // The same rule the read below states in the domain: an invitation without a settings row has no switches.
        featureSettings: { isNot: null },
      },
      select: SCHEDULED_SELECT,
      orderBy: { id: "asc" },
    });

    // A row whose switches do not read as the payload the rules accept is dropped here, exactly as the invitation read
    // answers no reminder settings for it (L9.1).
    return rows.flatMap((row) => {
      const scheduled = toScheduled(row);

      return scheduled === null ? [] : [scheduled];
    });
  }

  async hasDelivery(key: ReminderDeliveryKey): Promise<boolean> {
    const stored = await this.prisma.reminderDelivery.findUnique({
      where: {
        invitationId_guestId_kind_dueDate: {
          invitationId: key.invitationId,
          guestId: key.guestId,
          kind: key.kind,
          dueDate: dueDateColumn(key.dueDate),
        },
      },
      select: { id: true },
    });

    return stored !== null;
  }

  async claimDelivery(key: ReminderDeliveryKey, at: Date): Promise<ReminderDeliveryClaim | null> {
    try {
      const claimed = await this.prisma.reminderDelivery.create({
        data: {
          invitationId: key.invitationId,
          guestId: key.guestId,
          kind: key.kind,
          dueDate: dueDateColumn(key.dueDate),
          attemptedAt: at,
        },
        select: { id: true, kind: true, dueDate: true },
      });

      return {
        id: claimed.id,
        invitationId: key.invitationId,
        guestId: key.guestId,
        kind: claimed.kind,
        dueDate: claimed.dueDate.toISOString().slice(0, 10),
      };
    } catch (error) {
      // The unique index is the guard: another run of the same day already claimed this attempt, so this one sends
      // nothing (L9.4). Every other failure propagates, because a failed claim is not a delivery.
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async recordOutcome(id: string, result: ReminderSendResult): Promise<void> {
    await this.prisma.reminderDelivery.update({
      where: { id },
      data:
        result.status === "sent"
          ? { status: "sent", reason: null }
          : { status: result.status, reason: reasonColumn(result.reason) },
    });
  }
}
