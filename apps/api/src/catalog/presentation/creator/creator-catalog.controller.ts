import { Controller, Get, Inject } from "@nestjs/common";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicReader,
} from "../../application/public/catalog-public-reader";
import {
  type CreatorPackageResponse,
  type CreatorTemplateResponse,
  toCreatorPackageResponse,
  toCreatorTemplateResponse,
} from "./creator-catalog.response";

/**
 * The creator catalog: the templates and packages a signed-in customer may start an invitation from (M4 T4;
 * S8, A5). No `@Public()`: the global guard answers 401 without an active session, and no `@AdminOnly()`: any
 * customer reads it, because creating a draft is free (S6). The paths deliberately sit outside
 * `/admin/catalog/*`, so they cannot collide with the administration controllers. The reads go through the
 * catalog's own public application contract, so this presentation layer owns no query (module-template.md).
 */
@Controller("catalog")
export class CreatorCatalogController {
  constructor(@Inject(CATALOG_PUBLIC_READER) private readonly catalog: CatalogPublicReader) {}

  /** Only PUBLISHED templates whose PUBLISHED version exists, ordered by key (S8). */
  @Get("templates")
  async listTemplates(): Promise<CreatorTemplateResponse[]> {
    return (await this.catalog.listPublishedTemplates()).map(toCreatorTemplateResponse);
  }

  /** Only ACTIVE packages, ordered by key, each with its included feature keys and price in force (S8, A1). */
  @Get("packages")
  async listPackages(): Promise<CreatorPackageResponse[]> {
    return (await this.catalog.listActivePackages()).map(toCreatorPackageResponse);
  }
}
