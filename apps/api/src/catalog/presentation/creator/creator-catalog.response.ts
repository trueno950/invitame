import type {
  CreatorPackageSummary,
  CreatorTemplateSummary,
} from "../../application/public/catalog-public-reader";

// The stable REST shapes of the creator catalog (M4 T4; S8, A5). They are what a creator chooses from, so they
// carry no administration fields: no status flags, no version history, no timestamps, and nothing internal.
// T5 builds the web client from these shapes.

/** The stable REST shape of one template a creator may start an invitation from. */
export interface CreatorTemplateResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: { key: string; name: string };
  publishedVersion: {
    id: string;
    version: number;
    componentKey: string;
    schema: unknown;
  };
}

/** The stable REST shape of one package a creator may choose. */
export interface CreatorPackageResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  currentPrice: { amountMinor: number; currency: string } | null;
  includedFeatureKeys: string[];
}

export function toCreatorTemplateResponse(stored: CreatorTemplateSummary): CreatorTemplateResponse {
  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    category: { key: stored.category.key, name: stored.category.name },
    publishedVersion: {
      id: stored.publishedVersion.id,
      version: stored.publishedVersion.version,
      componentKey: stored.publishedVersion.componentKey,
      schema: stored.publishedVersion.schema,
    },
  };
}

export function toCreatorPackageResponse(stored: CreatorPackageSummary): CreatorPackageResponse {
  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    currentPrice: stored.currentPrice
      ? { amountMinor: stored.currentPrice.amountMinor, currency: stored.currentPrice.currency }
      : null,
    // A copy: the contract's list is `readonly`, the REST body is an ordinary array.
    includedFeatureKeys: [...stored.includedFeatureKeys],
  };
}
