import {
  ADMIN_ACTION,
  ADMIN_ACTION_REASON,
  type AdminActionReason,
} from "../../admin/admin-action-recorder";
import {
  changedSettings,
  OPERATIONAL_SETTINGS_BOUNDS,
  type OperationalSettings,
  type OperationalSettingsBounds,
  type OperationalSettingsField,
  settingsAuditNote,
  validateOperationalSettings,
} from "../domain/operational-settings";
import type { OperationalSettingsSnapshot } from "./operational-settings";
import { InvalidOperationalSettingsError } from "./operational-settings.errors";
import type { OperationalSettingsRepository } from "./operational-settings.repository";

// The administrator's configuration panel (M9 T13; S5, S8, L15). One read and one save. The read answers exactly what
// the web form renders: the seven settings, each field's bounds, and the instant the row was last written. The save
// validates the whole set first, so a refused request never reaches a statement; then, inside one transaction, it reads
// the row, and:
//
// - if nothing changed it answers the stored row and writes nothing — not the row, and not an audit row (S8: the audit
//   records the before and after, and there is no after to record);
// - otherwise it stores the new set and writes the one `AdminAction` row of this save, whose note always records
//   `field: old → new` for every changed field and then the administrator's optional note (S8 «Nota opcional»).
//
// The transaction is the point (S6, applied here): an audit row the domain refuses rolls the settings back with it, so
// no limit ever changes without the record of who changed it and from what.

/** What the panel answers: the stored settings, the bounds of each field, and when they were last written. */
export interface OperationalSettingsView {
  readonly settings: OperationalSettings;
  readonly bounds: Readonly<Record<OperationalSettingsField, OperationalSettingsBounds>>;
  readonly updatedAt: Date;
}

/** The values of one save: the administrator from the session, the seven settings, and the optional note (S5). */
export interface UpdateOperationalSettingsInput {
  adminUserId: string;
  settings: unknown;
  note?: unknown;
}

/** A stored row as the panel's answer. */
function viewOf(snapshot: OperationalSettingsSnapshot): OperationalSettingsView {
  const { updatedAt, ...settings } = snapshot;

  return { settings, bounds: OPERATIONAL_SETTINGS_BOUNDS, updatedAt };
}

/** The note the administrator wrote: absent, null, and a blank string all mean "no note". */
function administratorNote(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/** `GET /admin/settings`: the stored settings, read fresh on every call. */
export class GetOperationalSettingsUseCase {
  constructor(private readonly repository: OperationalSettingsRepository) {}

  async execute(): Promise<OperationalSettingsView> {
    return viewOf(await this.repository.current());
  }
}

/**
 * `PUT /admin/settings`: store the whole set, or write nothing when it equals what is stored. Every field is required
 * and bounded; the two cross-field rules are the domain's. Throws `InvalidOperationalSettingsError` with every issue
 * before any transaction opens.
 */
export class UpdateOperationalSettingsUseCase {
  private readonly now: () => Date;

  constructor(
    private readonly repository: OperationalSettingsRepository,
    now: () => Date = () => new Date(),
  ) {
    this.now = now;
  }

  async execute(input: UpdateOperationalSettingsInput): Promise<OperationalSettingsView> {
    const validation = validateOperationalSettings(input.settings);
    if (!validation.ok) {
      throw new InvalidOperationalSettingsError(validation.issues);
    }

    const note = administratorNote(input.note);
    // The audit reason is the closed set's own «Otro»: the note carries the whole story of the save, and S8 made the
    // administrator's part optional, which is exactly what the generated changes supply.
    const reason: AdminActionReason = ADMIN_ACTION_REASON.OTHER;

    return viewOf(
      await this.repository.transaction(async (unit) => {
        const current = await unit.current();
        const changes = changedSettings(current, validation.value);
        if (changes.length === 0) {
          return current;
        }

        const written = await unit.update(validation.value, this.now());
        await unit.record({
          adminUserId: input.adminUserId,
          action: ADMIN_ACTION.SETTINGS_UPDATED,
          reason,
          note: settingsAuditNote(changes, note),
          // The settings change names no resource: the migration's relaxed target checks allow exactly this action
          // with neither id set, and refuse every other action without its target.
          targetUserId: null,
          invitationId: null,
        });

        return written;
      }),
    );
  }
}
