import {
  INITIAL_OPERATIONAL_SETTINGS,
  type OperationalSettings,
} from "../domain/operational-settings";

// The settings module's one public read contract (M9 T13; S5, S8, L15). Consumers in the invitations and media modules
// inject `OPERATIONAL_SETTINGS_READER` and call `current()` at the moment they check a limit, never holding the answer:
// S8 decided a save takes effect on the next check, so a lowered limit stops the next addition and never touches what
// is already stored. Nothing here caches, and no consumer reads the row, the table, or the Prisma client of this
// module: this interface is the only door.

/** The single row as the admin read answers it: the seven settings and the instant they were last written. */
export interface OperationalSettingsSnapshot extends OperationalSettings {
  readonly updatedAt: Date;
}

/** Read the one settings row. Always a database read: the panel's save must be visible to the next check. */
export interface OperationalSettingsReader {
  current(): Promise<OperationalSettingsSnapshot>;
}

export const OPERATIONAL_SETTINGS_READER = Symbol("OperationalSettingsReader");

/**
 * The seeded values with an epoch instant, so a unit test that exercises a use case for another rule composes it
 * without a reader. The module always injects the Prisma adapter; this is the documentable default the domain itself
 * calls the initial values, never a second source of configuration.
 */
export const INITIAL_OPERATIONAL_SETTINGS_SNAPSHOT: OperationalSettingsSnapshot = {
  ...INITIAL_OPERATIONAL_SETTINGS,
  updatedAt: new Date(0),
};

/** The reader a use case falls back to when no settings module is composed, answering the initial values. */
export const INITIAL_OPERATIONAL_SETTINGS_READER: OperationalSettingsReader = {
  current: async () => INITIAL_OPERATIONAL_SETTINGS_SNAPSHOT,
};
