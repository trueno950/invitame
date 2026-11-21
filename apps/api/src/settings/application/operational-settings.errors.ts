import type { OperationalSettingsIssue } from "../domain/operational-settings";

/**
 * A settings request the domain refuses (S5, S8): a value outside its bounds or a cross-field rule it breaks. `issues`
 * are the deterministic `{ field, rule }` entries presentation answers as 400 `INVALID_SETTINGS`, and nothing was
 * stored.
 */
export class InvalidOperationalSettingsError extends Error {
  constructor(readonly issues: readonly OperationalSettingsIssue[]) {
    super("The operational settings are not valid.");
    this.name = "InvalidOperationalSettingsError";
  }
}
