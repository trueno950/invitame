import type { Prisma, PrismaClient } from "@prisma/client";

import type { AdminActionRecorder } from "../../admin/admin-action-recorder";
import type { OperationalSettings } from "../domain/operational-settings";
import type { OperationalSettingsSnapshot } from "../application/operational-settings";
import type {
  OperationalSettingsRepository,
  OperationalSettingsUnitOfWork,
} from "../application/operational-settings.repository";

// The settings module on PostgreSQL (M9 T13; S5, S8, L15). One row, addressed by its literal id because the migration's
// `OperationalSettings_single_row` check pins it: a read is one `findUnique`, and a save is one transaction that locks
// the row, writes it, and asks the admin module's recorder for the audit row on the same client, so the change and the
// record of who made it commit together — or neither does.
//
// A missing row is not an empty settings set: the migration seeds the row, so its absence means the deployment is
// wrong. The read fails loudly instead of answering limits nobody configured.

/** The columns a read answers, as the port's snapshot shape. */
const SETTINGS_COLUMNS = {
  rsvpDefaultPartyLimit: true,
  rsvpMaxPartyLimit: true,
  galleryPhotoLimit: true,
  storedAssetLimit: true,
  maxUploadMegabytes: true,
  placeSearchResultLimit: true,
  analyticsDefaultWindowDays: true,
  updatedAt: true,
} as const;

type SettingsRow = OperationalSettings & { updatedAt: Date };

const SETTINGS_ROW_ID = "default";

const MISSING_ROW_MESSAGE =
  "The OperationalSettings row is missing; the migration 20261129120000_add_operational_settings seeds it.";

export class PrismaOperationalSettingsRepository implements OperationalSettingsRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly actions: AdminActionRecorder,
  ) {}

  async current(): Promise<OperationalSettingsSnapshot> {
    return this.read(this.prisma);
  }

  async transaction<T>(work: (unit: OperationalSettingsUnitOfWork) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((transaction) => work(this.unitOfWork(transaction)));
  }

  /** One read of the single row, on whatever client the caller is using (the request client or a transaction). */
  private async read(client: PrismaClient | Prisma.TransactionClient): Promise<SettingsRow> {
    const row = await client.operationalSettings.findUnique({
      where: { id: SETTINGS_ROW_ID },
      select: SETTINGS_COLUMNS,
    });

    if (row === null) {
      throw new Error(MISSING_ROW_MESSAGE);
    }

    return row;
  }

  /**
   * One transaction's view of the row and of the audit table. `current` locks the row with `FOR UPDATE`, so a second
   * save waits instead of planning against a value the first one is about to replace.
   */
  private unitOfWork(transaction: Prisma.TransactionClient): OperationalSettingsUnitOfWork {
    return {
      current: async (): Promise<SettingsRow> => {
        const locked = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "OperationalSettings" WHERE "id" = ${SETTINGS_ROW_ID} FOR UPDATE
        `;
        if (locked.length === 0) {
          throw new Error(MISSING_ROW_MESSAGE);
        }

        return this.read(transaction);
      },
      update: async (values: OperationalSettings, at: Date): Promise<SettingsRow> =>
        transaction.operationalSettings.update({
          where: { id: SETTINGS_ROW_ID },
          data: {
            rsvpDefaultPartyLimit: values.rsvpDefaultPartyLimit,
            rsvpMaxPartyLimit: values.rsvpMaxPartyLimit,
            galleryPhotoLimit: values.galleryPhotoLimit,
            storedAssetLimit: values.storedAssetLimit,
            maxUploadMegabytes: values.maxUploadMegabytes,
            placeSearchResultLimit: values.placeSearchResultLimit,
            analyticsDefaultWindowDays: values.analyticsDefaultWindowDays,
            updatedAt: at,
          },
          select: SETTINGS_COLUMNS,
        }),
      // The audit row goes through the admin module's one public door, on this transaction: an entry the domain refuses
      // throws here, after the update statement ran, and the whole save rolls back.
      record: async (entry) => {
        await this.actions.record(transaction, entry);
      },
    };
  }
}
