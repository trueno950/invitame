import { ValidateBy, ValidateIf } from "class-validator";

import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_NAME_MAX_LENGTH,
  parseEntryDescription,
  parseEntryName,
} from "../../../domain/catalog-entry";

/** A name of 1 to 120 characters after trimming, without control characters. */
export const IsCatalogEntryName = () =>
  ValidateBy({
    name: "isCatalogEntryName",
    validator: {
      validate: (value: unknown) => parseEntryName(value) !== null,
      defaultMessage: () =>
        `name must be 1 to ${CATALOG_NAME_MAX_LENGTH} characters after trimming, without control characters`,
    },
  });

/** A description of at most 1000 characters; null clears it. */
export const IsCatalogEntryDescription = () =>
  ValidateBy({
    name: "isCatalogEntryDescription",
    validator: {
      validate: (value: unknown) => parseEntryDescription(value) !== null,
      defaultMessage: () =>
        `description must be null or at most ${CATALOG_DESCRIPTION_MAX_LENGTH} characters`,
    },
  });

/** A key that the given domain rule accepts. The rule decides; the key never selects a code path. */
export const IsCatalogKey = (parse: (value: unknown) => string | null, description: string) =>
  ValidateBy({
    name: "isCatalogKey",
    validator: {
      validate: (value: unknown) => parse(value) !== null,
      defaultMessage: () => `key must be ${description}`,
    },
  });

/** Skips the other validators of the property when the value is absent (but not when it is null). */
export const WhenPresent = () =>
  ValidateIf((_body: unknown, value: unknown) => value !== undefined);
