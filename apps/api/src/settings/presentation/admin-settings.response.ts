import { HttpException } from "@nestjs/common";

import type {
  OperationalSettingsBounds,
  OperationalSettingsField,
} from "../domain/operational-settings";
import { InvalidOperationalSettingsError } from "../application/operational-settings.errors";
import type { OperationalSettingsView } from "../application/operational-settings.use-cases";

// The stable REST shapes of the configuration panel (M9 T13; S5, S8, L15). Both routes answer the same object, so the
// web form renders one shape whether it just read the settings or just saved them: the seven settings, the bounds of
// each field (so the form can state them without a second source), and the instant of the last save.

/** What `GET` and `PUT /admin/settings` answer. */
export interface AdminSettingsResponse {
  settings: Record<OperationalSettingsField, number>;
  bounds: Record<OperationalSettingsField, OperationalSettingsBounds>;
  updatedAt: string;
}

export function toAdminSettingsResponse(view: OperationalSettingsView): AdminSettingsResponse {
  return {
    settings: { ...view.settings },
    bounds: { ...view.bounds },
    updatedAt: view.updatedAt.toISOString(),
  };
}

/**
 * Turns a refused settings save into its HTTP answer and rethrows anything unrecognized, so an unexpected bug is not
 * disguised as a client error. The body carries the domain's own `{ field, rule }` issues in field order.
 */
export function mapAdminSettingsError(error: unknown): never {
  if (error instanceof InvalidOperationalSettingsError) {
    throw new HttpException(
      {
        code: "INVALID_SETTINGS",
        message: "The operational settings are not valid.",
        issues: error.issues.map((issue) => ({ field: issue.field, rule: issue.rule })),
      },
      400,
    );
  }

  throw error;
}
