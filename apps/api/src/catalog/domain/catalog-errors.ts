/** A catalog entry (category or feature) with this key already exists. */
export class CatalogKeyTakenError extends Error {
  constructor(readonly key: string) {
    super("A catalog entry with this key already exists.");
    this.name = "CatalogKeyTakenError";
  }
}

/** A catalog entry command carries a value the domain refuses; the message names the rule. */
export class InvalidCatalogEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCatalogEntryError";
  }
}

/** A package's feature list names a feature that does not exist; nothing was stored. */
export class CatalogFeatureNotFoundError extends Error {
  constructor() {
    super("A listed feature does not exist.");
    this.name = "CatalogFeatureNotFoundError";
  }
}

/** Another request changed the same rows first (for example two price sets at once); retry. */
export class CatalogConcurrentUpdateError extends Error {
  constructor() {
    super("The catalog changed concurrently; retry the request.");
    this.name = "CatalogConcurrentUpdateError";
  }
}

/** A template names a category that does not exist; nothing was stored. */
export class CatalogCategoryNotFoundError extends Error {
  constructor() {
    super("The category does not exist.");
    this.name = "CatalogCategoryNotFoundError";
  }
}

/** A template may be PUBLISHED only while it has a PUBLISHED version (L4); nothing was changed. */
export class CatalogTemplateNotPublishableError extends Error {
  constructor() {
    super("A template is PUBLISHED only while it has a PUBLISHED version.");
    this.name = "CatalogTemplateNotPublishableError";
  }
}

/** A version's componentKey, schema, or configuration does not satisfy its renderer contract. */
export class CatalogRendererContractInvalidError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The version does not satisfy its renderer contract.");
    this.name = "CatalogRendererContractInvalidError";
  }
}
