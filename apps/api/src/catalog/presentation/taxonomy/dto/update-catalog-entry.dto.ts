import { IsBoolean } from "class-validator";

import { IsCatalogEntryDescription, IsCatalogEntryName, WhenPresent } from "./catalog-entry-fields";

/**
 * `PATCH` body of a category or a feature. The key is immutable, so it is not a field here and the
 * global ValidationPipe rejects it (`forbidNonWhitelisted`). An empty body is refused by the use case.
 */
export class UpdateCatalogEntryDto {
  @WhenPresent()
  @IsCatalogEntryName()
  name?: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;

  @WhenPresent()
  @IsBoolean()
  isActive?: boolean;
}
