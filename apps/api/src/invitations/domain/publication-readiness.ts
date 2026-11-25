// Publication readiness (M5 T2; S2, S3, S6, A1). Publishing is free until Milestone 7, so the only gate here
// is completeness: every `required` field of the pinned `TemplateVersion` schema is present, the full content
// re-validates against that schema, the package still fits the version's required features, and the pinned
// version is still published. An already published invitation keeps rendering its pinned version even if the
// catalog retires it later, so this rule is consulted only on the DRAFT -> PUBLISHED transition.
// Payment is not a domain rule: the application layer asks a payment port on its own (S6).

import {
  missingRequiredFields,
  omittedSectionKeys,
  requireOneSectionSets,
  validateDraftContent,
} from "./invitation-content";
import { type PackageEntitlements, packageFitsTemplateVersion } from "./package-fit";

/** The package no longer fits the pinned version: not ACTIVE, or missing a required feature key. */
export const PACKAGE_FIT_ISSUE = "package does not include the template's required features";

/** The pinned version is no longer PUBLISHED, so it must not accept a new publication. */
const VERSION_ISSUE = "template version is no longer published";

/**
 * The issues of the `x-require-one` sets of the pinned schema (S8.3): omitting every group of a set leaves the
 * invitation without the place, dress code, or contact the customer must keep. The issue names the set's own
 * keys, in the order the version declares them — `content.ceremony,reception needs one shown` — so the web can
 * map it to a sentence and a customer can act on it. A version without the extension has no set here and keeps
 * exactly the issues it had before.
 */
export function requireOneIssues(schema: unknown, content: unknown): string[] {
  const omitted = omittedSectionKeys(content);

  if (omitted.size === 0) {
    return [];
  }

  const issues: string[] = [];
  for (const set of requireOneSectionSets(schema)) {
    if (set.every((key) => omitted.has(key))) {
      issues.push(`content.${set.join(",")} needs one shown`);
    }
  }
  return issues;
}

/** What the readiness rule reads: the pinned schema and content, the chosen package, and the catalog status. */
export interface PublicationReadiness {
  readonly schema: unknown;
  readonly content: unknown;
  readonly packageEntitlements: PackageEntitlements;
  readonly requiredFeatureKeys: readonly string[];
  readonly versionPublished: boolean;
}

/**
 * The reasons this invitation cannot publish yet, or an empty array when it can (A1). The issues are
 * deterministic English strings in a fixed order — missing required fields in schema order, then the
 * `x-require-one` sets the content omits, then the `validateDraftContent` issues, then the package, then the
 * pinned version — and they never echo a stored value, only the key names and rules the schema declares. A
 * required field of an omitted section is not missing (S8.3).
 */
export function publicationIssues(readiness: PublicationReadiness): string[] {
  const issues: string[] = [];

  for (const key of missingRequiredFields(readiness.schema, readiness.content)) {
    issues.push(`content.${key} is required to publish`);
  }
  issues.push(...requireOneIssues(readiness.schema, readiness.content));

  const validation = validateDraftContent(readiness.schema, readiness.content);

  if (!validation.ok) {
    issues.push(...validation.issues);
  }
  if (!packageFitsTemplateVersion(readiness.packageEntitlements, readiness.requiredFeatureKeys)) {
    issues.push(PACKAGE_FIT_ISSUE);
  }
  if (!readiness.versionPublished) {
    issues.push(VERSION_ISSUE);
  }
  return issues;
}
