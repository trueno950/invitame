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
