import type { CatalogTemplate, TemplateStatus, TemplateVersionRecord } from "../../domain/template";

/** A validated new template: the domain already normalized `name` and `description`. */
export interface NewTemplate {
  key: string;
  name: string;
  description: string | null;
  categoryId: string;
}

/** Validated changes; an absent field is left as stored. `key` is immutable and not part of it. */
export interface TemplateChanges {
  name?: string;
  description?: string | null;
  categoryId?: string;
  status?: TemplateStatus;
}

/** A validated new snapshot; the registry contract was already checked. */
export interface NewTemplateVersion {
  componentKey: string;
  schema: unknown;
  configuration: unknown;
}

/**
 * Persistence port of templates and their versions. Operations that touch more than one row are atomic:
 * they store everything or nothing. Ids that name nothing answer null. Nothing is deleted, and the
 * snapshot fields of a version are never updated (S8): only its `status` moves, DRAFT to PUBLISHED to
 * RETIRED.
 */
export interface TemplateRepository {
  /** Every template ordered by key, with its category, published version, and version count. */
  list(): Promise<CatalogTemplate[]>;

  /**
   * Stores a DRAFT template. Throws `CatalogKeyTakenError` when the key exists and
   * `CatalogCategoryNotFoundError` when the category does not; either way nothing is stored.
   */
  create(input: NewTemplate): Promise<CatalogTemplate>;

  /**
   * Applies the changes; null, storing nothing, when no template has this id. Setting PUBLISHED while the
   * template has no PUBLISHED version throws `CatalogTemplateNotPublishableError` (L4);
   * an unknown category throws `CatalogCategoryNotFoundError`; both leave the row unchanged.
   */
  update(id: string, changes: TemplateChanges): Promise<CatalogTemplate | null>;

  /** The versions of a template, newest first; null when no template has this id. */
  listVersions(templateId: string): Promise<TemplateVersionRecord[] | null>;

  /**
   * Stores a DRAFT version numbered one above the template's highest (1 for the first), computed inside
   * the transaction. Throws `CatalogConcurrentUpdateError` when a concurrent create took the number;
   * null when no template has this id.
   */
  createVersion(
    templateId: string,
    input: NewTemplateVersion,
  ): Promise<TemplateVersionRecord | null>;

  /**
   * In one transaction: reads the stored version, requires it to be DRAFT
   * (`IllegalTemplateVersionTransitionError` otherwise), runs `verify` on the stored snapshot
   * (a non-empty answer throws `CatalogRendererContractInvalidError` with those issues), retires the
   * template's PUBLISHED version if any, and publishes this one. A concurrent publish that wins first
   * throws `CatalogConcurrentUpdateError`, so a template never has two PUBLISHED versions. Null when the
   * template does not exist or the version belongs to another template. `verify` runs inside the
   * transaction, before any write, and may be asynchronous.
   */
  publishVersion(
    templateId: string,
    versionId: string,
    verify: (version: TemplateVersionRecord) => readonly string[] | Promise<readonly string[]>,
  ): Promise<TemplateVersionRecord | null>;

  /**
   * PUBLISHED to RETIRED (`IllegalTemplateVersionTransitionError` for any other status). Retiring the
   * published version of a PUBLISHED template throws `CatalogTemplateNotPublishableError` (L4); the
   * template must be moved to DRAFT or ARCHIVED first. Null when the template does not exist or the
   * version belongs to another template.
   */
  retireVersion(templateId: string, versionId: string): Promise<TemplateVersionRecord | null>;
}

export const TEMPLATE_REPOSITORY = Symbol("TemplateRepository");
