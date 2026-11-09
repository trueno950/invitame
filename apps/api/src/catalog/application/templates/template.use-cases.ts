import {
  isCatalogEntryId,
  parseCategoryKey,
  parseEntryDescription,
  parseEntryName,
} from "../../domain/catalog-entry";
import {
  CatalogCategoryNotFoundError,
  CatalogRendererContractInvalidError,
  InvalidCatalogEntryError,
} from "../../domain/catalog-errors";
import {
  type CatalogTemplate,
  parseTemplateStatus,
  parseVersionJson,
  type TemplateStatus,
  type TemplateVersionRecord,
} from "../../domain/template";
import {
  listRendererKeys,
  validateTemplateVersionContract,
} from "../../domain/renderers/renderer-registry";
import type { TemplateChanges, TemplateRepository } from "./template.repository";

/** The values of a create request, as the transport delivered them. */
export interface CreateTemplateInput {
  key: string;
  name: string;
  description?: string | null;
  categoryId: string;
}

/** The fields of an update request; at least one must be present. */
export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  categoryId?: string;
  status?: TemplateStatus;
}

/** The values of a version request; the registry contract decides whether they are acceptable. */
export interface CreateTemplateVersionInput {
  componentKey: unknown;
  schema: unknown;
  configuration: unknown;
}

const INVALID_KEY =
  "key must be lowercase kebab-case of at most 100 characters, such as adventure.";
const INVALID_NAME = "name must be 1 to 120 characters after trimming, without control characters.";
const INVALID_DESCRIPTION = "description must be null or at most 1000 characters.";
const INVALID_STATUS = "status must be DRAFT, PUBLISHED, or ARCHIVED.";
const INVALID_SNAPSHOT_PART =
  "must be JSON of at most 64 KiB without NUL characters or unpaired surrogates.";

/** Lists every template, ordered by key. */
export class ListTemplatesUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  execute(): Promise<CatalogTemplate[]> {
    return this.templates.list();
  }
}

/**
 * Creates a DRAFT template. The values are validated again here, so a caller other than the HTTP route
 * cannot store an unbounded or malformed value. Throws `InvalidCatalogEntryError`, `CatalogKeyTakenError`,
 * and `CatalogCategoryNotFoundError`.
 */
export class CreateTemplateUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  async execute(input: CreateTemplateInput): Promise<CatalogTemplate> {
    const key = parseCategoryKey(input.key);
    if (key === null) {
      throw new InvalidCatalogEntryError(INVALID_KEY);
    }
    const name = parseEntryName(input.name);
    if (name === null) {
      throw new InvalidCatalogEntryError(INVALID_NAME);
    }
    const description = parseEntryDescription(input.description ?? null);
    if (description === null) {
      throw new InvalidCatalogEntryError(INVALID_DESCRIPTION);
    }
    // An id that is not a UUID names no category; the database would refuse it as a malformed value.
    if (typeof input.categoryId !== "string" || !isCatalogEntryId(input.categoryId)) {
      throw new CatalogCategoryNotFoundError();
    }

    return this.templates.create({
      key,
      name,
      description: description.value,
      categoryId: input.categoryId.toLowerCase(),
    });
  }
}

/**
 * Changes the name, description, category, or status of a template; the key is immutable. Returns null
 * when no template has this id. Throws `InvalidCatalogEntryError` for an empty or invalid change,
 * `CatalogCategoryNotFoundError`, and `CatalogTemplateNotPublishableError` (L4).
 */
export class UpdateTemplateUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  async execute(id: string, input: UpdateTemplateInput): Promise<CatalogTemplate | null> {
    const changes: TemplateChanges = {};
    if (input.name !== undefined) {
      const name = parseEntryName(input.name);
      if (name === null) {
        throw new InvalidCatalogEntryError(INVALID_NAME);
      }
      changes.name = name;
    }
    if (input.description !== undefined) {
      const description = parseEntryDescription(input.description);
      if (description === null) {
        throw new InvalidCatalogEntryError(INVALID_DESCRIPTION);
      }
      changes.description = description.value;
    }
    if (input.status !== undefined) {
      const status = parseTemplateStatus(input.status);
      if (status === null) {
        throw new InvalidCatalogEntryError(INVALID_STATUS);
      }
      changes.status = status;
    }
    if (input.categoryId !== undefined) {
      if (typeof input.categoryId !== "string" || !isCatalogEntryId(input.categoryId)) {
        throw new CatalogCategoryNotFoundError();
      }
      changes.categoryId = input.categoryId.toLowerCase();
    }
    if (Object.keys(changes).length === 0) {
      throw new InvalidCatalogEntryError(
        "At least one of name, description, categoryId, or status is required.",
      );
    }
    if (!isCatalogEntryId(id)) {
      return null;
    }

    return this.templates.update(id, changes);
  }
}

/** The renderer keys the API accepts for a version (S6); read-only, straight from the registry. */
export class ListRenderersUseCase {
  execute(): Array<{ componentKey: string }> {
    return listRendererKeys().map((componentKey) => ({ componentKey }));
  }
}

/** The versions of a template, newest first; null when no template has this id. */
export class ListTemplateVersionsUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  async execute(templateId: string): Promise<TemplateVersionRecord[] | null> {
    return isCatalogEntryId(templateId) ? this.templates.listVersions(templateId) : null;
  }
}

/**
 * Creates a DRAFT version of a template (S2, S6, S8). `schema` and `configuration` are each bounded
 * (64 KiB) and checked against the renderer registry before anything is stored. Throws
 * `InvalidCatalogEntryError` for an unbounded or unstorable part, `CatalogRendererContractInvalidError`
 * with the issues for a contract violation, and `CatalogConcurrentUpdateError` when a concurrent create
 * took the version number. Returns null when no template has this id.
 */
export class CreateTemplateVersionUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  async execute(
    templateId: string,
    input: CreateTemplateVersionInput,
  ): Promise<TemplateVersionRecord | null> {
    if (!parseVersionJson(input.schema)) {
      throw new InvalidCatalogEntryError(`schema ${INVALID_SNAPSHOT_PART}`);
    }
    if (!parseVersionJson(input.configuration)) {
      throw new InvalidCatalogEntryError(`configuration ${INVALID_SNAPSHOT_PART}`);
    }
    const contract = validateTemplateVersionContract(input);
    if (!contract.ok) {
      throw new CatalogRendererContractInvalidError(contract.issues);
    }
    if (!isCatalogEntryId(templateId)) {
      return null;
    }

    // The contract accepted `componentKey`, so it is a registered string.
    return this.templates.createVersion(templateId, {
      componentKey: String(input.componentKey),
      schema: input.schema,
      configuration: input.configuration,
    });
  }
}

/**
 * Publishes a DRAFT version and retires the template's previously published one, in one transaction (S5).
 * The stored snapshot is checked against the registry again at that moment. Throws
 * `IllegalTemplateVersionTransitionError` for a version that is not DRAFT,
 * `CatalogRendererContractInvalidError` for a snapshot the registry no longer accepts, and
 * `CatalogConcurrentUpdateError` when a concurrent publish won. Returns null when the template or the
 * version does not exist, or the version belongs to another template.
 */
export class PublishTemplateVersionUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  async execute(templateId: string, versionId: string): Promise<TemplateVersionRecord | null> {
    if (!isCatalogEntryId(templateId) || !isCatalogEntryId(versionId)) {
      return null;
    }

    return this.templates.publishVersion(templateId, versionId, (version) => {
      const contract = validateTemplateVersionContract(version);
      return contract.ok ? [] : contract.issues;
    });
  }
}

/**
 * Retires the PUBLISHED version of a template that is not itself PUBLISHED (L4). Throws
 * `IllegalTemplateVersionTransitionError` for a version that is not PUBLISHED and
 * `CatalogTemplateNotPublishableError` while the template is PUBLISHED. Returns null when the template
 * or the version does not exist, or the version belongs to another template.
 */
export class RetireTemplateVersionUseCase {
  constructor(private readonly templates: TemplateRepository) {}

  async execute(templateId: string, versionId: string): Promise<TemplateVersionRecord | null> {
    if (!isCatalogEntryId(templateId) || !isCatalogEntryId(versionId)) {
      return null;
    }

    return this.templates.retireVersion(templateId, versionId);
  }
}
