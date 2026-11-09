import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import {
  CatalogCategoryNotFoundError,
  CatalogConcurrentUpdateError,
  CatalogRendererContractInvalidError,
  CatalogTemplateNotPublishableError,
} from "../../domain/catalog-errors";
import type { CatalogTemplate, TemplateVersionRecord } from "../../domain/template";
import { IllegalTemplateVersionTransitionError } from "../../domain/template-version-lifecycle";
import { mapCatalogError } from "../taxonomy/catalog-entry.response";

/** The stable REST shape of a template with its category and version summary. */
export interface TemplateResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  category: { id: string; key: string; name: string };
  createdAt: string;
  updatedAt: string;
  publishedVersion: { id: string; version: number } | null;
  versionCount: number;
}

/** The stable REST shape of one immutable version snapshot. */
export interface TemplateVersionResponse {
  id: string;
  version: number;
  status: string;
  componentKey: string;
  schema: unknown;
  configuration: unknown;
  createdAt: string;
}

export function toTemplateResponse(stored: CatalogTemplate): TemplateResponse {
  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    status: stored.status,
    category: { id: stored.category.id, key: stored.category.key, name: stored.category.name },
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
    publishedVersion: stored.publishedVersion
      ? { id: stored.publishedVersion.id, version: stored.publishedVersion.version }
      : null,
    versionCount: stored.versionCount,
  };
}

export function toTemplateVersionResponse(stored: TemplateVersionRecord): TemplateVersionResponse {
  return {
    id: stored.id,
    version: stored.version,
    status: stored.status,
    componentKey: stored.componentKey,
    schema: stored.schema,
    configuration: stored.configuration,
    createdAt: stored.createdAt.toISOString(),
  };
}

/** No template has the id of the path, or the id is not a UUID. */
export function orTemplateNotFound(stored: CatalogTemplate | null): TemplateResponse {
  if (!stored) {
    throw new NotFoundException();
  }
  return toTemplateResponse(stored);
}

/** No template or version has the ids of the path, or a version belongs to another template. */
export function orVersionNotFound(stored: TemplateVersionRecord | null): TemplateVersionResponse {
  if (!stored) {
    throw new NotFoundException();
  }
  return toTemplateVersionResponse(stored);
}

/**
 * Maps a template error to its HTTP outcome; the shared catalog errors go through `mapCatalogError`. A
 * contract violation is a 400 when a version is created (the request is wrong) and a 409 when a stored
 * version is published (the request is right, the registry changed), so the caller says which.
 */
export function mapTemplateError(
  error: unknown,
  contractViolation: "request" | "stored-version" = "request",
): never {
  if (error instanceof CatalogCategoryNotFoundError) {
    throw new BadRequestException({ code: "CATALOG_CATEGORY_NOT_FOUND" });
  }
  if (error instanceof CatalogTemplateNotPublishableError) {
    throw new ConflictException({ code: "CATALOG_TEMPLATE_NOT_PUBLISHABLE" });
  }
  if (error instanceof IllegalTemplateVersionTransitionError) {
    throw new ConflictException({ code: "CATALOG_VERSION_TRANSITION_NOT_ALLOWED" });
  }
  if (error instanceof CatalogConcurrentUpdateError) {
    throw new ConflictException({ code: "CATALOG_CONCURRENT_UPDATE" });
  }
  if (error instanceof CatalogRendererContractInvalidError) {
    const body = { code: "CATALOG_RENDERER_CONTRACT_INVALID", issues: error.issues };
    throw contractViolation === "request"
      ? new BadRequestException(body)
      : new ConflictException(body);
  }
  return mapCatalogError(error);
}
