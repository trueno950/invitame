import { ArrayMaxSize, ArrayUnique, IsArray, IsDefined, IsIn, IsUUID } from "class-validator";

import { parseCategoryKey } from "../../../domain/catalog-entry";
import {
  MAX_PACKAGE_FEATURES,
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
