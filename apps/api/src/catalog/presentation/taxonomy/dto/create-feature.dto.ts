import { parseFeatureKey } from "../../../domain/catalog-entry";
import {
  IsCatalogEntryDescription,
  IsCatalogEntryName,
  IsCatalogKey,
  WhenPresent,
} from "./catalog-entry-fields";

/** `POST /admin/catalog/features` body. The global ValidationPipe rejects any other field. */
export class CreateFeatureDto {
  @IsCatalogKey(parseFeatureKey, "UPPER_SNAKE of at most 100 characters")
  key!: string;

  @IsCatalogEntryName()
  name!: string;

  @WhenPresent()
  @IsCatalogEntryDescription()
  description?: string | null;
}
