import { IsDefined, IsIn, IsUUID } from "class-validator";

import { parseCategoryKey } from "../../../domain/catalog-entry";
import { TEMPLATE_STATUSES, type TemplateStatus } from "../../../domain/template";
import {
  IsCatalogEntryDescription,
  IsCatalogEntryName,
  IsCatalogKey,
  WhenPresent,
} from "../../taxonomy/dto/catalog-entry-fields";

/** `POST /admin/catalog/templates` body. The global ValidationPipe rejects any other field. */
export class CreateTemplateDto {
  @IsCatalogKey(parseCategoryKey, "lowercase kebab-case of at most 100 characters")
  key!: string;

  @IsCatalogEntryName()
  name!: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;

  @IsUUID("all")
  categoryId!: string;
}

/**
 * `PATCH /admin/catalog/templates/:id` body. The key is immutable, so it is not a field here and the
 * global ValidationPipe rejects it (`forbidNonWhitelisted`). An empty body is refused by the use case.
 */
export class UpdateTemplateDto {
  @WhenPresent()
  @IsCatalogEntryName()
  name?: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;

  @WhenPresent()
  @IsUUID("all")
  categoryId?: string;

  @WhenPresent()
  @IsIn(TEMPLATE_STATUSES)
  status?: TemplateStatus;
}

/**
 * `POST /admin/catalog/templates/:id/versions` body. Only presence is checked here: the renderer
 * registry owns the contract of the three values, and the use case bounds the size of the JSON parts.
 */
export class CreateTemplateVersionDto {
  @IsDefined()
  componentKey!: unknown;

  @IsDefined()
  schema!: unknown;

  @IsDefined()
  configuration!: unknown;
}
