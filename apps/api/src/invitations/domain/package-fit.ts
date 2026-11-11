// The package-fit rule checked when a draft is created (M4 T2; S6, A1). Creating and editing a draft is
// free for any active customer: the chosen package is only validated, and the payment happens at
// publication (M5/M7). Feature keys and statuses are data compared by equality; no package or feature name
// selects behavior.

/** The only package status whose entitlements apply to a new draft. */
export const ACTIVE_PACKAGE_STATUS = "ACTIVE";

/** What the fit rule reads from the chosen package, as the catalog exposes it. */
export interface PackageEntitlements {
  readonly packageStatus: string;
  readonly includedFeatureKeys: readonly string[];
}

/**
 * Whether the chosen package fits a template version: it must be `ACTIVE` and include every feature key
 * that version's renderer requires (`RendererContract.requiredFeatureKeys`). An empty requirement fits any
 * active package, and extra package features never matter. Any other status, including an unknown one,
 * does not fit, so the rule fails closed.
 */
export function packageFitsTemplateVersion(
  entitlements: PackageEntitlements,
  requiredFeatureKeys: readonly string[],
): boolean {
  if (entitlements.packageStatus !== ACTIVE_PACKAGE_STATUS) {
    return false;
  }

  const included = new Set(entitlements.includedFeatureKeys);
  return requiredFeatureKeys.every((featureKey) => included.has(featureKey));
}
