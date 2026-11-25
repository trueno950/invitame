import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsUUID,
  Max,
  Min,
} from "class-validator";

import { parseCategoryKey } from "../../../domain/catalog-entry";
import {
  MAX_PACKAGE_DURATION_DAYS,
  MAX_PACKAGE_FEATURES,
  MIN_PACKAGE_DURATION_DAYS,
  PACKAGE_STATUSES,
  type PackageStatus,
} from "../../../domain/package";
import {
  IsCatalogEntryDescription,
  IsCatalogEntryName,
  IsCatalogKey,
  WhenPresent,
} from "../../taxonomy/dto/catalog-entry-fields";

/** `POST /admin/catalog/packages` body. The global ValidationPipe rejects any other field. */
export class CreatePackageDto {
  @IsCatalogKey(parseCategoryKey, "lowercase kebab-case of at most 100 characters")
  key!: string;

  @IsCatalogEntryName()
  name!: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;

  /**
   * The package's duration in days (S1, T1). Optional: a request that names none gets the basic month, the same value
   * the column defaults to. The bounds are stated here so a malformed value is a `400` the transport names, and
   * again in the domain, so no other caller can store one.
   */
  @WhenPresent()
  @IsInt()
  @Min(MIN_PACKAGE_DURATION_DAYS)
  @Max(MAX_PACKAGE_DURATION_DAYS)
  durationDays?: number;
}

/**
 * `PATCH /admin/catalog/packages/:id` body. The key is immutable, so it is not a field here and the
 * global ValidationPipe rejects it (`forbidNonWhitelisted`). An empty body is refused by the use case.
 */
export class UpdatePackageDto {
  @WhenPresent()
  @IsCatalogEntryName()
  name?: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;

  @WhenPresent()
  @IsIn(PACKAGE_STATUSES)
  status?: PackageStatus;

  @WhenPresent()
  @IsInt()
  @Min(MIN_PACKAGE_DURATION_DAYS)
  @Max(MAX_PACKAGE_DURATION_DAYS)
  durationDays?: number;
}

/** `PUT /admin/catalog/packages/:id/features` body: the complete list of linked feature ids. */
export class SetPackageFeaturesDto {
  @IsArray()
  @ArrayMaxSize(MAX_PACKAGE_FEATURES)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  featureIds!: string[];
}

/**
 * `PUT /admin/catalog/packages/:id/price` body. Only presence is checked here: the domain owns the
 * currency allow-list and the amount rule, and its message reaches the client.
 */
export class SetPackagePriceDto {
  @IsDefined()
  currency!: unknown;

  @IsDefined()
  amountMinor!: unknown;
}
