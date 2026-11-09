import { parseCategoryKey } from "../../../domain/catalog-entry";
import {
  IsCatalogEntryDescription,
  IsCatalogEntryName,
  IsCatalogKey,
  WhenPresent,
} from "./catalog-entry-fields";

/** `POST /admin/catalog/categories` body. The global ValidationPipe rejects any other field. */
export class CreateCategoryDto {
  @IsCatalogKey(parseCategoryKey, "lowercase kebab-case of at most 100 characters")
  key!: string;

  @IsCatalogEntryName()
  name!: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;
}
