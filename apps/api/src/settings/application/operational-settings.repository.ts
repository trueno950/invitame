import type { AdminActionEntry } from "../../admin/admin-action-recorder";
import type { OperationalSettings } from "../domain/operational-settings";
import type { OperationalSettingsSnapshot } from "./operational-settings";

// The persistence port of the settings module (M9 T13; S5, S8, L15). It is shaped as a unit of work because the save has
// to decide and act on the same row: the update and its audit row commit together, and an audit entry the domain
// refuses rolls the update back with it (S6 «Misma transacción», applied to the panel). The use case reads the row
// through `current()`, decides what changed, and applies only the fields it changed; nothing here caches, so the next
// read answers what was stored.

/** One transaction over the single settings row and the audit table. */
export interface OperationalSettingsUnitOfWork {
  /** The row as this transaction sees it, locked against a concurrent save (one row, one administrator). */
  current(): Promise<OperationalSettingsSnapshot>;

  /** Stores the whole new set and answers the stored row with `updatedAt` set to `at`. */
  update(values: OperationalSettings, at: Date): Promise<OperationalSettingsSnapshot>;

  /**
   * Writes the audit row of this save on this transaction, through the admin module's recorder. An entry the audit
   * domain refuses throws, so the caller's update rolls back and no settings change is stored unrecorded.
   */
  record(entry: AdminActionEntry): Promise<void>;
}

export interface OperationalSettingsRepository {
  /** The one row, for a read that needs no transaction. */
  current(): Promise<OperationalSettingsSnapshot>;

  /** Runs `work` inside one transaction and commits it; anything thrown rolls the whole save back. */
  transaction<T>(work: (unit: OperationalSettingsUnitOfWork) => Promise<T>): Promise<T>;
}

export const OPERATIONAL_SETTINGS_REPOSITORY = Symbol("OperationalSettingsRepository");
